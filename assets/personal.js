(() => {
  'use strict';
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const button = (label, action, cls = 'button') => { const b = el('button', label, cls); b.type = 'button'; b.onclick = action; return b; };
  const link = (label, href) => { const a = el('a', label, 'button'); a.href = href; return a; };
  const panel = () => document.getElementById('personal');
  const route = (path, question) => `#/page/${encodeURIComponent(path)}${question ? "?question="+encodeURIComponent(question) : ""}`;
  const time = value => new Date(value).toLocaleString('zh-CN');
  let store = null, connected = false, ready = false, busy = false, initError = '';
  let records = [], pages = [], favoritePaths = [], editing = false, revision = 0;
  let publicCatalog = [];
  const guestRecords = new Map(), guestReceipts = new Set(), runtimeSections = new Map();
  const pending = new Map();
  let writeChain = Promise.resolve(), resetting = false;
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
    if (!store?.user || resetting) return;
    const epoch = revision;
    const result = await Promise.all([store.list('study_records'), store.list('study_pages', 'id,title,category,updated_at,created_at,question_index'), store.list('study_favorites')]);
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
    const title = field(form, '小节名称', 'title', original?.title); title.required = true; title.maxLength = 200;
    const category = field(form, '分类', 'category', original?.category || '基础科学'); category.required = true; category.maxLength = 100;
    const file = field(form, '选择 HTML 文件（也可直接粘贴源码）', 'file', '', 'file'); file.accept = '.html,.htm,text/html';
    const source = field(form, 'HTML 源码', 'html', original?.html, 'textarea'); source.required = true; source.className = 'code-editor'; source.spellcheck = false;
    file.onchange = () => run(async () => {
      const upload = file.files[0]; if (!upload) return;
      if (upload.size > 2097152) throw new Error('HTML 超过 2 MB，请缩小文件后再上传。');
      source.value = await upload.text();
      const info = sectionFromHtml(source.value);
      if (!original) { title.value = info?.section || upload.name.replace(/\.html?$/i, ''); category.value = info?.category || category.value; }
    });
    formActions(form, '保存到云端', async data => {
      const values = {title: data.get('title').trim(), category: data.get('category').trim(), html: data.get('html')};
      if (!values.title || !values.category || !values.html.trim()) throw new Error('请填写名称、分类和 HTML 内容。');
      if (new Blob([values.html]).size > 2097152) throw new Error('HTML 超过 2 MB。');
      values.question_index = sectionFromHtml(values.html)?.questions || [];
      await store.save('study_pages', values, original ? {id: original.id, version: original.updated_at} : {});
      editing = false; await refresh(); render(); message('HTML 已保存到云端。');
    });
    title.focus();
  }
  function editRecord(row) {
    const form = beginEdit(row ? '编辑学习记录' : '新增学习笔记');
    const title = field(form, '标题', 'title', row?.title); title.required = true; title.maxLength = 200;
    const path = field(form, '关联页面路径（可留空）', 'page_path', row?.page_path); path.maxLength = 500; path.readOnly = Boolean(row?.question_id);
    if (row?.question_id) form.append(el('p', `题目编号：${row.question_id}。答案与历史由每次实际提交记录；可在题目中点击「再做一次」。`, 'description'));
    select(form, '复习标记', 'marked', [['false', '未标记'], ['true', '已标记复习']], String(row?.marked || false));
    const note = field(form, '笔记', 'note', row?.note, 'textarea'); note.maxLength = 20000; note.rows = 7;
    formActions(form, '保存记录', async data => {
      const values = {title: data.get('title').trim(), page_path: data.get('page_path').trim(), note: data.get('note'), marked: data.get('marked') === 'true'};
      if (!values.title) throw new Error('请填写标题。');
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
    const reset = el('section', undefined, 'reset-learning');
    reset.append(el('h2', '清除学习数据'), el('p', '清空全部页面收藏、题目复习标记、学习记录（含笔记）、答题结果及累计正确 / 错误次数。上传的 HTML 文件和账号保留。此操作不可恢复，需要连续确认两次。', 'description'), button('清除全部学习数据', e => run(clearLearningData, e.target), 'button danger'));
    panel().append(reset);
  }
  async function clearLearningData() {
    if (!confirm('第 1 次确认：清除全部页面收藏、题目标记、学习记录（含笔记）和答题历史？上传的 HTML 文件会保留。')) return;
    if (!confirm('第 2 次确认：这些学习数据将永久清除，无法恢复。所有题目会回到未做状态，正确 / 错误次数归零。确定立即清除？')) return;
    resetting = true;
    try {
      // Let already-started saves finish before the atomic database reset.
      await writeChain;
      await store.clearLearningData();
      revision++; records = []; favoritePaths = []; pending.clear();
      guestRecords.clear(); guestReceipts.clear(); editing = false;
      try { localStorage.removeItem(`tmu-page-favorites:${location.pathname}`); } catch { /* Cloud reset still succeeded. */ }
      changed(); render(); message('全部学习数据已清除。上传的 HTML 文件已保留，可以重新开始练习。');
    } finally { resetting = false; }
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
    for (const [value, name] of [['all','全部记录'],['wrong','错题'],['marked','标记复习'],['notes','笔记']]) { const o = el('option',name); o.value=value; filter.append(o); }
    toolbar.append(search, filter, button('新增笔记', () => editRecord()), button('刷新', e => run(async () => { await refresh(); render(); message('记录已刷新。'); }, e.target)), button('导出 JSON', () => download('学习记录.json', JSON.stringify(records, null, 2), 'application/json')));
    const list = el('div', undefined, 'record-list'); panel().append(toolbar, list);
    const draw = () => {
      list.replaceChildren(); const query = search.value.trim().toLowerCase();
      const filtered = records.filter(r => `${r.title} ${r.page_path} ${r.note}`.toLowerCase().includes(query) && (filter.value === 'all' || filter.value === 'wrong' && r.submitted && r.correct === false || filter.value === 'marked' && r.marked || filter.value === 'notes' && !r.question_id)).sort((a,b) => b.updated_at.localeCompare(a.updated_at));
      for (const row of filtered) {
        const card = el('article', undefined, 'record-card');
        const kind = row.question_id ? row.submitted ? (row.correct ? '答对' : '错题') : '未提交' : '笔记';
        card.append(el('p', `${kind}${row.marked ? ' · 已标记复习' : ''}`, 'eyebrow'), el('h2',row.title));
        if (row.selected !== null) card.append(el('p', `已选：${String.fromCharCode(65+row.selected)}`, 'description'));
        if (row.question_id) card.append(el('p',`答题历史：正确 ${row.correct_count || 0} 次 · 错误 ${row.wrong_count || 0} 次`,'description'));
        if (row.note) card.append(el('p', row.note, 'record-note'));
        card.append(el('p',`${row.page_path || '独立笔记'} · ${time(row.updated_at)}`, 'filename'));
        const actions = el('div', undefined, 'actions');
        if (row.page_path) actions.append(link('打开页面', route(row.page_path, row.question_id)));
        actions.append(button('编辑', () => editRecord(row)), button('删除', e => run(async () => {
          if (!confirm(`删除「${row.title}」这条学习记录？该题的累计答题历史也会清除。`)) return;
          await store.remove('study_records', 'id', row.id, row.updated_at); await refresh(); render(); message('记录已删除。');
        }, e.target), 'button danger'));
        card.append(actions); list.append(card);
      }
      if (!filtered.length) list.append(el('p','暂无匹配记录。可以新增笔记，或打开题库作答。','empty-state'));
    };
    search.oninput = draw; filter.onchange = draw; draw();
  }
  function renderPages() {
    panel().append(link('下载标准小节模板 ↓','./downloads/小节题库模板.html'));
    panel().lastChild.setAttribute('download','小节题库模板.html');
    panel().append(el('h1','管理 HTML'), el('p','在这里上传的页面仅自己登录后可见。每个 HTML 是一个小节，可包含多道题。名称按“分类 / 小节.html”显示，编辑和删除立即同步到云端。','description'));
    const toolbar = el('div', undefined, 'record-tools');
    const search = el('input'); search.type = 'search'; search.placeholder = '搜索分类或知识点'; search.setAttribute('aria-label','搜索私人 HTML');
    toolbar.append(search,button('上传 HTML', e => run(() => editPage(), e.target)), button('刷新', e => run(async () => { await refresh(); render(); }, e.target)));
    const count = el('p', '', 'description'); count.setAttribute('role','status');
    const list = el('div', undefined, 'page-grid'); panel().append(toolbar, el('h2','已上传的 HTML 文件'), count, list);
    const draw = () => {
      list.replaceChildren();
      const filtered = pages.filter(p => `${p.title} ${p.category}`.toLowerCase().includes(search.value.trim().toLowerCase()));
      count.textContent = `共 ${pages.length} 个文件${search.value.trim() ? `，匹配 ${filtered.length} 个` : ''}`;
      for (const row of filtered) {
        const card = el('article', undefined, 'page-card');
        card.append(el('p',row.category,'eyebrow'),el('h2',row.title),el('p',`${row.category}/${row.title}.html`,'filename'),el('p',`上传于 ${time(row.created_at)} · 更新于 ${time(row.updated_at)}`,'filename'));
        if (row.question_index?.length) card.append(el('p',`包含 ${row.question_index.length} 道题`,'description'));
        const actions = el('div',undefined,'actions');
        actions.append(link('打开',route(`私有/${row.id}`)),button('编辑',e => run(() => editPage(row),e.target)),button('下载',e=>run(async()=> { const page = await store.page(row.id); download(`${page.title}.html`, page.html, 'text/html'); },e.target)),button('删除',e=>run(async()=>{
          const filename = `${row.category}/${row.title}.html`;
          if (!confirm(`第 1 次确认：删除上传的 HTML 文件「${filename}」？只删除这个文件，其他 HTML 和已有学习记录会保留。`)) return;
          if (!confirm(`第 2 次确认：永久删除「${filename}」？此操作无法恢复。如需保留文件，请取消并先下载备份。`)) return;
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
    if (view === 'review') { renderReview(); return; }
    if (view === 'account' || !store?.user) { renderAccount(); return; }
    if (view === 'records') renderRecords(); else renderPages();
  }
  function download(filename, data, type) {
    const url = URL.createObjectURL(new Blob([data],{type})); const a = link('',url); a.download=filename; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function sectionFromHtml(html) {
    const raw = new DOMParser().parseFromString(html, 'text/html').querySelector('script#quiz-data');
    if (!raw) return null;
    let data; try { data=JSON.parse(raw.textContent); } catch { throw new Error('模板的 quiz-data 不是有效 JSON。'); }
    const ids=new Set();
    if(data.version!==2 || typeof data.section!=='string' || typeof data.category!=='string' || !Array.isArray(data.questions) || !data.questions.length)throw new Error('请使用完整的小节模板。');
    const questions=data.questions.map(q=>{
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(q.id)||ids.has(q.id)||typeof q.title!=='string'||!q.title||!q.stem||!Array.isArray(q.options)||q.options.length<2||q.options.length>26||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length||!q.explanation||!Array.isArray(q.optionExplanations)||q.optionExplanations.length!==q.options.length)throw new Error('题目字段缺失或 ID 重复：'+q.id);
      ids.add(q.id);return {id:q.id,title:q.title.slice(0,200)};
    });
    return {section:data.section,category:data.category,questions};
  }
  function currentRecords() { return store?.user ? records : [...guestRecords.values()]; }
  function reviewQuestions() {
    const allPages=[...publicCatalog,...api.pages], result=new Map();
    for(const page of allPages){
      const index=runtimeSections.get(page.path)?.questions || page.question_index || [];
      for(const q of index){
        const key=JSON.stringify([page.path,q.id]),row=currentRecords().find(r=>r.page_path===page.path&&r.question_id===q.id);
        result.set(key,{...row,page_path:page.path,question_id:q.id,title:q.title,section:page.title,category:page.category});
      }
    }
    for(const row of currentRecords().filter(r=>r.question_id)){
      const key=JSON.stringify([row.page_path,row.question_id]);
      if(!result.has(key))result.set(key,{...row,section:row.page_path,category:'其他题目'});
    }
    return [...result.values()];
  }
  let reviewFilter='marked',reviewQuery='';
  function renderReview() {
    panel().append(el('h1','标记复习'),el('p','星标是手动收藏的复习题；待复习包含未做或最后一次答错的题。答对后会移出待复习，星标仍由你决定保留。','description'));
    if(!store?.user)panel().append(el('p','当前显示本次窗口的练习记录。登录后读取个人云端记录。','description'));
    const toolbar=el('div',undefined,'record-tools'),search=el('input');search.type='search';search.placeholder='搜索小节或题目';search.setAttribute('aria-label','搜索复习题目');search.value=reviewQuery;
    const tabs=el('div',undefined,'review-tabs'),list=el('div',undefined,'record-list');
    const questions=reviewQuestions();
    const modes=[['marked','标记复习',r=>r.marked],['pending','待复习（未做 / 错误）',r=>!r.submitted||r.correct!==true],['all','全部题目',()=>true]];
    for(const [value,label,predicate]of modes){const b=button(`${label} · ${questions.filter(predicate).length}`,()=>{reviewFilter=value;render();});b.setAttribute('aria-pressed',String(value===reviewFilter));tabs.append(b);}
    toolbar.append(search);if(store?.user)toolbar.append(button('刷新记录',e=>run(async()=>{await refresh();render();},e.target)));
    panel().append(tabs,toolbar,list);
    function draw(){
      list.replaceChildren();const query=search.value.trim().toLowerCase();reviewQuery=search.value;
      const predicate=modes.find(m=>m[0]===reviewFilter)[2];
      for(const row of questions.filter(r=>predicate(r)&&`${r.title} ${r.section} ${r.category}`.toLowerCase().includes(query))){
        const card=el('article',undefined,'record-card');card.dataset.questionId=row.question_id;
        card.append(el('p',`${row.category} / ${row.section}`,'eyebrow'),el('h2',row.title),el('p',`最后一次：${row.submitted?(row.correct?'答对':'错误'):'未做'} · 正确 ${row.correct_count||0} 次 / 错误 ${row.wrong_count||0} 次`,'description'));
        const actions=el('div',undefined,'actions');actions.append(link('定位到这道题 →',route(row.page_path,row.question_id)),button(row.marked?'取消标记':'标记复习',()=>api.questionEvent(row.page_path,row.title,{action:'mark',question_id:row.question_id,title:row.title,request_id:crypto.randomUUID(),marked:!row.marked})));
        card.append(actions);list.append(card);
      }
      if(!list.children.length)list.append(el('p',reviewFilter==='marked'?'还没有标记的题目。点击每道题右上角的「标记复习」。':'没有匹配的题目。','empty-state'));
    }search.oninput=draw;draw();
  }
  function emitResult(job, result) {
    window.dispatchEvent(new CustomEvent('study-question-result',{detail:{page_path:job.page_path,request_id:job.event.request_id,question_id:job.event.question_id,...result}}));
  }
  async function savePending(key) {
    const job=pending.get(key);if(!job||!store?.user)return;
    const epoch=revision;
    try {
      const saved=await store.questionEvent(job.page_path,job.title,job.event);
      if(epoch!==revision)return;
      records=records.filter(r=>r.id!==saved.id);records.push(saved);pending.delete(key);
      emitResult(job,{record:saved,saved:true});
      message(pending.size?'正在保存学习记录…':'学习记录已保存到云端。',pending.size>0);changed();
    }catch(error){
      if(epoch!==revision)return;
      message(errorText(error),true);emitResult(job,{error:errorText(error)});
    }
  }
  function validEvent(event) {
    return event && typeof event.question_id==='string' && typeof event.request_id==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(event.question_id) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.request_id) &&
      (event.action==='mark'&&typeof event.marked==='boolean'||event.action==='attempt'&&Number.isInteger(event.selected)&&event.selected>=0&&event.selected<=25&&typeof event.correct==='boolean');
  }
  const api = {
    get user(){return store?.user;}, get ready(){return ready;}, get configured(){return connected;},
    get pages(){return pages.map(p=>({...p,path:`私有/${p.id}`,private:true}));},
    get favorites(){return favoritePaths;},
    render, refresh, sectionFromHtml,
    setCatalog(value) { publicCatalog=value; },
    registerSection(path, section) {
      if(Array.isArray(section?.questions)&&section.questions.every(q=>/^[a-zA-Z0-9_-]{1,100}$/.test(q.id)&&typeof q.title==='string'))runtimeSections.set(path,section);
    },
    get markedCount(){return reviewQuestions().filter(q=>q.marked).length;},
    reviewQuestions,
    pending(path) { return [...pending.values()].filter(j=>j.page_path===path).map(j=>j.event); },
    async html(page) { return (await store.page(page.id)).html; },
    state(path) { return currentRecords().filter(r=>r.page_path===path && r.question_id).map(({question_id,selected,submitted,correct,marked,correct_count,wrong_count})=>({question_id,selected,submitted,correct,marked,correct_count,wrong_count})); },
    questionEvent(path,title,event) {
      if(resetting)return;
      if(!validEvent(event)||typeof path!=='string'||path.length>500)return;
      const job={page_path:path,title:(typeof event.title==='string'&&event.title ? event.title : title).slice(0,200),event:{request_id:event.request_id,question_id:event.question_id,action:event.action,selected:event.selected,correct:event.correct,marked:event.marked}};
      if(!store?.user){
        const key=JSON.stringify([path,event.question_id]);
        let state=guestRecords.get(key)||{page_path:path,title:job.title,question_id:event.question_id,selected:null,submitted:false,correct:null,marked:false,correct_count:0,wrong_count:0};
        if(!guestReceipts.has(event.request_id)){
          state={...state};if(event.action==='mark')state.marked=event.marked;
          else {state.selected=event.selected;state.correct=event.correct;state.submitted=true;state[event.correct?'correct_count':'wrong_count']++;}
          guestRecords.set(key,state);guestReceipts.add(event.request_id);
        }
        emitResult(job,{record:state,saved:false});changed();return;
      }
      if(!pending.has(event.request_id))pending.set(event.request_id,job);
      message('正在保存学习记录…');writeChain=writeChain.then(()=>savePending(event.request_id));
    },
    async favorite(path, marked) {
      if (!store?.user || resetting) return false;
      const epoch=revision;
      const task=writeChain.then(async()=>{
        if (marked) await store.save('study_favorites',{page_path:path},{conflict:'user_id,page_path'});
        else await store.remove('study_favorites','page_path',path);
        if(epoch!==revision)return false;
        favoritePaths = favoritePaths.filter(p=>p!==path); if(marked)favoritePaths.push(path); changed(); return true;
      });
      writeChain=task.catch(()=>{}); return task;
    },
    saveAnswer(path,title,data) {
      // Legacy single-question HTML support; unchanged answers used to mean a mark toggle.
      if(!data||!/^[a-zA-Z0-9_-]{1,100}$/.test(data.question_id))return;
      const prior=api.state(path).find(r=>r.question_id===data.question_id);
      const attempt=data.submitted&&(!prior?.submitted||prior.selected!==data.selected);
      api.questionEvent(path,title,{...data,action:attempt?'attempt':'mark',request_id:crypto.randomUUID()});
    }
  };
  window.Personal = api;
  document.getElementById('retry-sync').onclick = () => { if(resetting)return; for(const key of pending.keys()) writeChain=writeChain.then(()=>savePending(key)); };
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
