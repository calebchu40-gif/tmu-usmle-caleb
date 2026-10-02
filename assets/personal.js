(() => {
  'use strict';
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const button = (label, action, cls = 'button') => { const b = el('button', label, cls); b.type = 'button'; b.onclick = action; return b; };
  const link = (label, href) => { const a = el('a', label, 'button'); a.href = href; return a; };
  const panel = () => document.getElementById('personal');
  const route = path => `#/page/${encodeURIComponent(path)}`;
  const time = value => new Date(value).toLocaleString('zh-CN');
  let store = null, connected = false, ready = false, busy = false, initError = '';
  let records = [], pages = [], favoritePaths = [], editing = false, revision = 0;
  const pending = new Map();
  let writeChain = Promise.resolve();
  const changed = () => window.dispatchEvent(new Event('study-data-changed'));
  function message(text, retry = false) {
    document.getElementById('sync-message').textContent = text;
    document.getElementById('sync-banner').hidden = !text;
    document.getElementById('retry-sync').hidden = !retry;
  }
  function errorText(error) {
    if (error?.code === '23505') return '另一台设备已保存此记录，请刷新数据后再编辑。';
    if (/fetch|network/i.test(error?.message || '')) return '网络连接失败，内容尚未保存。请检查网络后重试。';
    return error?.message || '操作失败，请重试。';
  }
  async function run(action, trigger) {
    if (busy) return;
    busy = true; if (trigger) trigger.disabled = true;
    try { await action(); } catch (error) { message(errorText(error), pending.size > 0); }
    finally { busy = false; if (trigger) trigger.disabled = false; }
  }
  async function refresh() {
    if (!store?.user) return;
    const epoch = revision;
    const result = await Promise.all([store.list('study_records'), store.list('study_pages', 'id,title,category,updated_at,created_at'), store.list('study_favorites')]);
    if (epoch !== revision || !store.user) return;
    [records, pages] = result; favoritePaths = result[2].map(r => r.page_path);
    changed();
  }
  function field(form, label, name, value = '', type = 'text') {
    const wrapper = el('label', undefined, 'form-field'); wrapper.append(el('span', label));
    const input = el(type === 'textarea' ? 'textarea' : 'input'); input.name = name; input.value = value;
    if (type !== 'textarea') input.type = type;
    wrapper.append(input); form.append(wrapper); return input;
  }
  function select(form, label, name, options, value) {
    const wrapper = el('label', undefined, 'form-field'); wrapper.append(el('span', label));
    const input = el('select'); input.name = name;
    for (const [id, title] of options) { const o = el('option', title); o.value = id; input.append(o); }
    input.value = value; wrapper.append(input); form.append(wrapper); return input;
  }
  function beginEdit(title) {
    editing = true; panel().replaceChildren(el('p', 'PERSONAL WORKSPACE', 'eyebrow'), el('h1', title));
    const form = el('form', undefined, 'editor-form'); panel().append(form); return form;
  }
  function formActions(form, label, submit) {
    const actions = el('div', undefined, 'actions');
    const save = el('button', label, 'button primary'); save.type = 'submit';
    actions.append(save, button('取消', () => { editing = false; render(); })); form.append(actions);
    form.onsubmit = event => { event.preventDefault(); run(() => submit(new FormData(form)), save); };
  }
  async function editPage(row) {
    let original = row ? await store.page(row.id) : null;
    const form = beginEdit(original ? '编辑 HTML' : '上传 HTML');
    form.append(el('p', '支持单个完整 HTML，最大 2 MB；图片和样式请内嵌或使用 HTTPS 地址。保存后立即出现在左侧目录，仅登录后可见。', 'description'));
    const title = field(form, '知识点名称', 'title', original?.title); title.required = true; title.maxLength = 200;
    const category = field(form, '分类', 'category', original?.category || '基础科学'); category.required = true; category.maxLength = 100;
    const file = field(form, '选择 HTML 文件（也可直接粘贴源码）', 'file', '', 'file'); file.accept = '.html,.htm,text/html';
    const source = field(form, 'HTML 源码', 'html', original?.html, 'textarea'); source.required = true; source.className = 'code-editor'; source.spellcheck = false;
    file.onchange = () => run(async () => {
      const upload = file.files[0]; if (!upload) return;
      if (upload.size > 2097152) throw new Error('HTML 超过 2 MB，请缩小文件后再上传。');
      source.value = await upload.text();
      if (!title.value) title.value = upload.name.replace(/\.html?$/i, '');
    });
    formActions(form, '保存到云端', async data => {
      const values = {title: data.get('title').trim(), category: data.get('category').trim(), html: data.get('html')};
      if (!values.title || !values.category || !values.html.trim()) throw new Error('请填写名称、分类和 HTML 内容。');
      if (new Blob([values.html]).size > 2097152) throw new Error('HTML 超过 2 MB。');
      await store.save('study_pages', values, original ? {id: original.id, version: original.updated_at} : {});
      editing = false; await refresh(); render(); message('HTML 已保存到云端。');
    });
    title.focus();
  }
  function editRecord(row) {
    const form = beginEdit(row ? '编辑学习记录' : '新增学习笔记');
    const title = field(form, '标题', 'title', row?.title); title.required = true; title.maxLength = 200;
    const path = field(form, '关联页面路径（可留空）', 'page_path', row?.page_path); path.maxLength = 500; path.readOnly = Boolean(row?.question_id);
    if (row?.question_id) {
      form.append(el('p', `题目编号：${row.question_id}`, 'description'));
      select(form, '已选择的答案', 'selected', [['', '未作答'], ...Array.from({length:26}, (_,i) => [String(i), String.fromCharCode(65+i)])], row.selected === null ? '' : String(row.selected));
      select(form, '答题结果', 'correct', [['', '未提交'], ['true', '正确'], ['false', '错误']], row.submitted ? String(row.correct) : '');
    }
    select(form, '复习标记', 'marked', [['false', '无需复习'], ['true', '待复习']], String(row?.marked || false));
    const note = field(form, '笔记', 'note', row?.note, 'textarea'); note.maxLength = 20000; note.rows = 7;
    formActions(form, '保存记录', async data => {
      const values = {title: data.get('title').trim(), page_path: data.get('page_path').trim(), note: data.get('note'), marked: data.get('marked') === 'true'};
      if (!values.title) throw new Error('请填写标题。');
      if (row?.question_id) {
        values.selected = data.get('selected') === '' ? null : Number(data.get('selected'));
        values.correct = data.get('correct') === '' ? null : data.get('correct') === 'true';
        values.submitted = values.correct !== null;
        if (values.submitted && values.selected === null) throw new Error('已提交的答题记录需要选择一个答案。');
      }
      await store.save('study_records', values, row ? {id: row.id, version: row.updated_at} : {});
      editing = false; await refresh(); render(); message('学习记录已保存。');
    });
    title.focus();
  }
  function renderAccount() {
    panel().append(el('h1', '个人账号'));
    if (!ready) { panel().append(el('p', '正在连接云端…', 'description')); return; }
    if (initError) { panel().append(el('p', initError, 'description'), button('重试连接', () => location.reload())); return; }
    if (!connected) { panel().append(el('p', '云端尚未配置。连接个人数据库后，即可登录并跨设备保存。', 'description')); return; }
    if (!store.user) {
      panel().append(el('p', '仅供站点主人使用，不开放注册。登录后管理私人 HTML、学习记录和收藏。', 'description'));
      const form = el('form', undefined, 'editor-form login-form');
      const email = field(form, '邮箱', 'email', '', 'email'); email.required = true; email.autocomplete = 'username';
      const password = field(form, '密码', 'password', '', 'password'); password.required = true; password.autocomplete = 'current-password';
      const submit = el('button', '登录', 'button primary'); submit.type = 'submit'; form.append(submit);
      form.onsubmit = event => { event.preventDefault(); run(async () => {
        await store.login(email.value.trim(), password.value); password.value = ''; revision++;
        await refresh(); render(); message('已登录，学习记录将保存到云端。');
      }, submit); };
      panel().append(form); return;
    }
    panel().append(el('p', `已登录：${store.user.email}`, 'description'));
    const actions = el('div', undefined, 'actions');
    actions.append(link('管理学习记录', '#/records'), link('管理 HTML', '#/manage'), button('刷新云端数据', e => run(async () => { await refresh(); message('已获取最新云端数据。'); }, e.target)), button('退出登录', e => run(async () => {
      if (pending.size && !confirm('还有未保存的答题记录，退出将丢弃这些修改。仍要退出吗？')) return;
      await store.logout(); clearPrivate(); render(); message('已退出，当前页面的私人数据已清除。');
    }, e.target)));
    panel().append(actions, el('p', '私人记录和上传的 HTML 仅此账号可访问。原 GitHub 页面仍为公开内容。', 'description'));
  }
  function clearPrivate() {
    revision++; records = []; pages = []; favoritePaths = []; pending.clear(); editing = false;
    if (store) store.user = null;
    changed();
  }
  function renderRecords() {
    panel().append(el('h1', '学习记录'), el('p', '自动保存的答题记录与手动笔记。删除答题记录后，再次打开对应页面可重新作答。', 'description'));
    const toolbar = el('div', undefined, 'record-tools');
    const search = el('input'); search.type = 'search'; search.placeholder = '搜索标题、页面或笔记'; search.setAttribute('aria-label', '搜索学习记录');
    const filter = el('select'); filter.setAttribute('aria-label', '记录筛选');
    for (const [value, name] of [['all','全部记录'],['wrong','错题'],['marked','待复习'],['notes','笔记']]) { const o = el('option',name); o.value=value; filter.append(o); }
    toolbar.append(search, filter, button('新增笔记', () => editRecord()), button('刷新', e => run(async () => { await refresh(); render(); message('记录已刷新。'); }, e.target)), button('导出 JSON', () => download('学习记录.json', JSON.stringify(records, null, 2), 'application/json')));
    const list = el('div', undefined, 'record-list'); panel().append(toolbar, list);
    const draw = () => {
      list.replaceChildren(); const query = search.value.trim().toLowerCase();
      const filtered = records.filter(r => `${r.title} ${r.page_path} ${r.note}`.toLowerCase().includes(query) && (filter.value === 'all' || filter.value === 'wrong' && r.submitted && r.correct === false || filter.value === 'marked' && r.marked || filter.value === 'notes' && !r.question_id)).sort((a,b) => b.updated_at.localeCompare(a.updated_at));
      for (const row of filtered) {
        const card = el('article', undefined, 'record-card');
        const kind = row.question_id ? row.submitted ? (row.correct ? '答对' : '错题') : '未提交' : '笔记';
        card.append(el('p', `${kind}${row.marked ? ' · 待复习' : ''}`, 'eyebrow'), el('h2',row.title));
        if (row.selected !== null) card.append(el('p', `已选：${String.fromCharCode(65+row.selected)}`, 'description'));
        if (row.note) card.append(el('p', row.note, 'record-note'));
        card.append(el('p',`${row.page_path || '独立笔记'} · ${time(row.updated_at)}`, 'filename'));
        const actions = el('div', undefined, 'actions');
        if (row.page_path) actions.append(link('打开页面', route(row.page_path)));
        actions.append(button('编辑', () => editRecord(row)), button('删除', e => run(async () => {
          if (!confirm(`删除「${row.title}」这条学习记录？`)) return;
          await store.remove('study_records', 'id', row.id, row.updated_at); await refresh(); render(); message('记录已删除。');
        }, e.target), 'button danger'));
        card.append(actions); list.append(card);
      }
      if (!filtered.length) list.append(el('p','暂无匹配记录。可以新增笔记，或打开题库作答。','empty-state'));
    };
    search.oninput = draw; filter.onchange = draw; draw();
  }
  function renderPages() {
    panel().append(el('h1','管理 HTML'), el('p','在这里上传的页面仅自己登录后可见。名称按“分类 / 知识点.html”显示，编辑和删除立即同步到云端。','description'));
    const toolbar = el('div', undefined, 'record-tools');
    const search = el('input'); search.type = 'search'; search.placeholder = '搜索分类或知识点'; search.setAttribute('aria-label','搜索私人 HTML');
    toolbar.append(search,button('上传 HTML', e => run(() => editPage(), e.target)), button('刷新', e => run(async () => { await refresh(); render(); }, e.target)));
    const list = el('div', undefined, 'page-grid'); panel().append(toolbar, list);
    const draw = () => {
      list.replaceChildren();
      for (const row of pages.filter(p => `${p.title} ${p.category}`.toLowerCase().includes(search.value.trim().toLowerCase()))) {
        const card = el('article', undefined, 'page-card');
        card.append(el('p',row.category,'eyebrow'),el('h2',row.title),el('p',`${row.category}/${row.title}.html`,'filename'),el('p',`更新于 ${time(row.updated_at)}`,'filename'));
        const actions = el('div',undefined,'actions');
        actions.append(link('打开',route(`私有/${row.id}`)),button('编辑',e => run(() => editPage(row),e.target)),button('下载',e=>run(async()=> { const page = await store.page(row.id); download(`${page.title}.html`, page.html, 'text/html'); },e.target)),button('删除',e=>run(async()=>{
          if (!confirm(`删除私人页面「${row.title}」？已有学习记录会保留。`)) return;
          await store.remove('study_pages','id',row.id,row.updated_at); await refresh(); render(); message('私人 HTML 已删除。');
        },e.target),'button danger'));
        card.append(actions);list.append(card);
      }
      if (!list.children.length) list.append(el('p','还没有匹配的私人页面。点击「上传 HTML」添加。','empty-state'));
    }; search.oninput = draw; draw();
    const publicNote = el('div', undefined, 'public-note'); publicNote.append(el('h2','GitHub 公开页面'),el('p','原先的两个页面仍由 GitHub 部署。修改或删除公开源文件，请在 GitHub 仓库操作；不会影响私人学习记录。','description'),link('管理公开源文件 ↗','https://github.com/calebchu40-gif/tmu-usmle-caleb'));
    panel().append(publicNote);
  }
  function render() {
    if (panel().hidden) return;
    const view = location.hash.slice(2);
    panel().replaceChildren(el('p','PERSONAL WORKSPACE','eyebrow')); editing = false;
    if (view === 'account' || !store?.user) { renderAccount(); return; }
    if (view === 'records') renderRecords(); else renderPages();
  }
  function download(filename, data, type) {
    const url = URL.createObjectURL(new Blob([data],{type})); const a = link('',url); a.download=filename; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function savePending(key) {
    const job = pending.get(key); if (!job || !store?.user) return;
    const epoch = revision;
    const prior = records.find(r=>r.page_path === job.page_path && r.question_id === job.question_id);
    const saved = await store.save('study_records',job,prior ? {id:prior.id,version:prior.updated_at} : {});
    if (epoch !== revision) return;
    records = records.filter(r=>r.id!==saved.id); records.push(saved);
    if (pending.get(key) === job) pending.delete(key);
    message(pending.size ? '正在保存学习记录…' : '学习记录已保存到云端。',pending.size>0);
  }
  const api = {
    get user(){return store?.user;}, get configured(){return connected;},
    get pages(){return pages.map(p=>({...p,path:`私有/${p.id}`,private:true}));},
    get favorites(){return favoritePaths;},
    render, refresh,
    async html(page) { return (await store.page(page.id)).html; },
    state(path) { return records.filter(r=>r.page_path===path && r.question_id).map(({question_id,selected,submitted,correct,marked})=>({question_id,selected,submitted,correct,marked})); },
    async favorite(path, marked) {
      if (!store?.user) return false;
      if (marked) await store.save('study_favorites',{page_path:path},{conflict:'user_id,page_path'});
      else await store.remove('study_favorites','page_path',path);
      favoritePaths = favoritePaths.filter(p=>p!==path); if(marked)favoritePaths.push(path); changed(); return true;
    },
    saveAnswer(path,title,data) {
      if (!store?.user) { message('当前未登录：本次答题尚未保存。登录后重新提交可保存到云端。'); return; }
      if (!data || typeof data.question_id!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.question_id) || !(data.selected===null || Number.isInteger(data.selected)&&data.selected>=0&&data.selected<=25) || typeof data.submitted!=='boolean' || typeof data.marked!=='boolean' || !(data.correct===null || typeof data.correct==='boolean')) return;
      const job = {page_path:path,title:title.slice(0,200),question_id:data.question_id,selected:data.selected,submitted:data.submitted,marked:data.marked,correct:data.correct};
      const key = JSON.stringify([path,data.question_id]); pending.set(key,job); message('正在保存学习记录…');
      writeChain = writeChain.then(()=>savePending(key)).catch(error=>message(errorText(error),true));
    }
  };
  window.Personal = api;
  document.getElementById('retry-sync').onclick = () => { for(const key of pending.keys()) writeChain=writeChain.then(()=>savePending(key)).catch(e=>message(errorText(e),true)); };
  window.addEventListener('beforeunload',e=>{if(pending.size || editing){e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && store?.user && !editing && !busy && !pending.size) refresh().catch(e=>message(errorText(e))); });
  (async()=>{
    try {
      store=await window.connectStudyCloud(); connected=Boolean(store);
      if(store){ await store.checkSession(); if(store.user)await refresh();
        store.client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clearPrivate();render();}});
      }
    } catch(error){initError=errorText(error);}
    ready=true;changed();render();
  })();
})();
