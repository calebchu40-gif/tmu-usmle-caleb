/* Shared study site data. The site is public, so every answer and mark is kept in this browser. */
(() => {
  'use strict';
  const KEYS = {
    study_records: 'tmu-study-records',
    study_favorites: 'tmu-study-favorites',
    study_pages: 'tmu-study-pages',
    receipts: 'tmu-study-receipts'
  };
  const LOCAL_USER = {id: 'local-browser', email: '本机浏览器'};
  const MAX_RECEIPTS = 4000;
  const memoryFallback = new Map();

  function uniqueId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? value : [];
    } catch {
      const fallback = memoryFallback.get(key);
      return Array.isArray(fallback) ? fallback : [];
    }
  }
  function write(key, value) {
    memoryFallback.set(key, value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Private mode or a full disk still allows practice for this window. */
    }
  }
  const stamp = () => new Date().toISOString();

  class StudyStore {
    constructor() { this.user = null; }
    /* personal.js only subscribes to sign-out events; the public site has no sessions. */
    get client() { return {auth: {onAuthStateChange() { /* no account sessions */ }}}; }
    async checkSession() { this.user = LOCAL_USER; return this.user; }
    async login() { this.user = LOCAL_USER; return this.user; }
    async logout() { this.user = null; }
    displayName() { return '本机浏览器'; }
    requireUser() {
      if (!this.user) throw new Error('学习记录尚未就绪，请刷新页面后重试。');
      return this.user.id;
    }
    async list(table) {
      this.requireUser();
      if (table === 'study_favorites') return read(KEYS.study_favorites).map((row, index) => ({id: row.id || `favorite-${index}`, page_path: row.page_path}));
      if (!KEYS[table]) return [];
      return read(KEYS[table]).map(row => ({...row}));
    }
    async page(id) {
      this.requireUser();
      const row = read(KEYS.study_pages).find(item => item.id === id);
      if (!row) throw new Error('这个页面已经不存在。');
      return {...row};
    }
    async save(table, values, {id, version, conflict} = {}) {
      this.requireUser();
      const key = KEYS[table];
      if (!key) throw new Error('无法保存未知类型的数据。');
      const rows = read(key);
      const updated_at = stamp();
      if (id) {
        const index = rows.findIndex(row => row.id === id);
        if (index < 0) return null;
        if (version && rows[index].updated_at !== version) return null;
        rows[index] = {...rows[index], ...values, id, updated_at};
        write(key, rows);
        return {...rows[index]};
      }
      if (conflict) {
        const fields = conflict.split(',').filter(field => field in values);
        const index = rows.findIndex(row => fields.every(field => row[field] === values[field]));
        if (index >= 0) {
          rows[index] = {...rows[index], ...values, updated_at};
          write(key, rows);
          return {...rows[index]};
        }
      }
      const row = {id: uniqueId(), created_at: updated_at, updated_at, ...values};
      rows.push(row);
      write(key, rows);
      return {...row};
    }
    async remove(table, key, value, version) {
      this.requireUser();
      const storageKey = KEYS[table];
      if (!storageKey) throw new Error('无法删除未知类型的数据。');
      const rows = read(storageKey);
      const target = rows.find(row => row[key] === value);
      if (!target) {
        if (version) throw new Error('数据已变更，请刷新后再删除。');
        return;
      }
      if (version && target.updated_at !== version) throw new Error('数据已变更，请刷新后再删除。');
      write(storageKey, rows.filter(row => row !== target));
    }
    async questionEvent(path, title, event) {
      this.requireUser();
      const rows = read(KEYS.study_records);
      const updated_at = stamp();
      let row = rows.find(item => item.page_path === path && item.question_id === event.question_id);
      if (!row) {
        row = {
          id: uniqueId(), page_path: path, question_id: event.question_id, title: title || '',
          note: '', selected: null, submitted: false, correct: null, marked: false,
          correct_count: 0, wrong_count: 0, elapsed_seconds: 0,
          created_at: updated_at, updated_at
        };
        rows.push(row);
      }
      if (title) row.title = title;
      const receipts = read(KEYS.receipts);
      if (!receipts.includes(event.request_id)) {
        if (event.action === 'mark') {
          row.marked = event.marked === true;
        } else {
          row.selected = Number(event.selected);
          row.correct = event.correct === true;
          row.submitted = true;
          const counter = event.correct === true ? 'correct_count' : 'wrong_count';
          row[counter] = Math.max(0, Number(row[counter]) || 0) + 1;
          row.elapsed_seconds = Math.max(0, Math.floor(Number(row.elapsed_seconds) || 0) + Math.max(0, Math.floor(Number(event.elapsed_seconds) || 0)));
        }
        receipts.push(event.request_id);
        write(KEYS.receipts, receipts.slice(-MAX_RECEIPTS));
      }
      row.updated_at = updated_at;
      write(KEYS.study_records, rows);
      return {...row};
    }
    async clearLearningData() {
      this.requireUser();
      write(KEYS.study_records, []);
      write(KEYS.study_favorites, []);
      write(KEYS.receipts, []);
    }
  }

  window.StudyStore = StudyStore;
  window.connectStudyStore = async () => new StudyStore();
})();
