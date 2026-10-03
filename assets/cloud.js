/* Authentication and data access; iframe content never receives this client. */
(() => {
  'use strict';
  const INTERNAL_USERNAME_DOMAIN = 'users.invalid';
  function loginIdentity(identifier) {
    const value = String(identifier || '').trim();
    if (value.includes('@')) return value;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(value)) {
      throw new Error('请输入有效的用户名或邮箱。用户名需为 3–32 位字母、数字、点、下划线或短横线。');
    }
    return `${value.toLowerCase()}@${INTERNAL_USERNAME_DOMAIN}`;
  }
  class CloudStore {
    constructor(client) { this.client = client; this.user = null; }
    async checkSession() {
      const {data, error} = await this.client.auth.getUser();
      if (error && error.name !== 'AuthSessionMissingError') throw error;
      if (!data.user) { this.user = null; return null; }
      const owner = await this.client.from('workspace_owner').select('user_id').eq('user_id', data.user.id).maybeSingle();
      if (owner.error) throw owner.error;
      if (!owner.data) { await this.client.auth.signOut(); this.user = null; throw new Error('这个账号没有此工作台的访问权限。'); }
      this.user = data.user; return this.user;
    }
    requireUser() { if (!this.user) throw new Error('请先登录个人账号。'); return this.user.id; }
    displayName(user = this.user) {
      const email = user?.email || '';
      const suffix = `@${INTERNAL_USERNAME_DOMAIN}`;
      return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length) : email;
    }
    async login(identifier, password) {
      const email = loginIdentity(identifier);
      const {error} = await this.client.auth.signInWithPassword({email, password});
      if (error) throw new Error('登录失败，请检查账号和密码；邮箱注册账号还需先完成邮箱验证并获得访问授权。');
      return this.checkSession();
    }
    async registerEmail(email, password) {
      const normalized = String(email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('邮箱注册请填写有效邮箱地址。');
      if (String(password || '').length < 8) throw new Error('密码至少需要 8 位。');
      const {data, error} = await this.client.auth.signUp({email: normalized, password});
      if (error) throw new Error(error.message || '邮箱注册失败。');
      if (data.session) await this.client.auth.signOut({scope: 'local'});
      return {confirmationRequired: !data.session};
    }
    async logout() {
      const {error} = await this.client.auth.signOut({scope: 'local'});
      if (error) throw error;
      this.user = null;
    }
    async list(table, columns = '*') {
      this.requireUser();
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const {data, error} = await this.client.from(table).select(columns).order(table === 'study_favorites' ? 'page_path' : 'id').range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return rows;
      }
    }
    async save(table, values, {id, version, conflict} = {}) {
      const user_id = this.requireUser();
      let query;
      if (id) {
        query = this.client.from(table).update(values).eq('id', id);
        if (version) query = query.eq('updated_at', version);
      } else if (conflict) query = this.client.from(table).upsert({...values, user_id}, {onConflict: conflict});
      else query = this.client.from(table).insert({...values, user_id});
      const {data, error} = await query.select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('数据已在另一台设备修改或删除，请刷新后再编辑。');
      return data;
    }
    async remove(table, key, value, version) {
      this.requireUser();
      let query = this.client.from(table).delete().eq(key, value);
      if (version) query = query.eq('updated_at', version);
      const {data, error} = await query.select(key);
      if (error) throw error;
      if (!data?.length && version) throw new Error('数据已变更，请刷新后再删除。');
    }
    async questionEvent(path, title, event) {
      this.requireUser();
      const params = {
        p_page:path, p_question:event.question_id, p_title:title,
        p_event:event.request_id, p_action:event.action,
        p_selected:event.action === 'attempt' ? event.selected : null,
        p_correct:event.action === 'attempt' ? event.correct : null,
        p_marked:event.action === 'mark' ? event.marked : null
      };
      const elapsed = event.action === 'attempt' ? Math.max(0, Math.floor(event.elapsed_seconds || 0)) : 0;
      let {data, error} = await this.client.rpc('study_question_event', {...params,p_elapsed_seconds:elapsed}).single();
      let timeSyncPending = false;
      if (error && (error.code === 'PGRST202' || /p_elapsed_seconds|schema cache/i.test(error.message || ''))) {
        ({data, error} = await this.client.rpc('study_question_event', params).single());
        timeSyncPending = !error;
      }
      if (error) throw error;
      if (!data?.id) throw new Error('未收到云端保存结果，请重试。');
      if (timeSyncPending) data.time_sync_pending = true;
      return data;
    }
    async page(id) {
      this.requireUser();
      const {data, error} = await this.client.from('study_pages').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    }
    async clearLearningData() {
      this.requireUser();
      const {error} = await this.client.rpc('clear_study_learning_data');
      if (error) throw error;
    }
  }
  window.CloudStore = CloudStore;
  window.connectStudyCloud = async () => {
    const response = await fetch('./assets/cloud-config.json', {cache: 'no-cache'});
    if (!response.ok) throw new Error('云端配置加载失败，请刷新重试。');
    const config = await response.json();
    if (!config.url || !config.publishableKey) return null;
    const {createClient} = await import('./vendor/supabase.js');
    return new CloudStore(createClient(config.url, config.publishableKey, {auth: {detectSessionInUrl: false}}));
  };
})();
