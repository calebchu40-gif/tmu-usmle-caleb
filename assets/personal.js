(() => {
  'use strict';
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const button = (label, action, cls = 'button') => { const b = el('button', label, cls); b.type = 'button'; b.onclick = action; return b; };
  const link = (label, href) => { const a = el('a', label, 'button'); a.href = href; return a; };
  const panel = () => document.getElementById('personal');
  const route = (path, question) => `#/page/${encodeURIComponent(path)}${question ? "?question="+encodeURIComponent(question) : ""}`;
  const time = value => new Date(value).toLocaleString('zh-CN');
  let store = null, connected = false, ready = false, busy = false, initError = '';
  let records = [], favoritePaths = [], editing = false;
  let publicCatalog = [];
  const runtimeSections = new Map();
  let resetting = false;

  const changed = () => window.dispatchEvent(new Event('study-data-changed'));
  function message(text, retry = false) {
    document.getElementById('sync-message').textContent = text;
    document.getElementById('sync-banner').hidden = !text;
    document.getElementById('retry-sync').hidden = !retry;
  }
  function errorText(error) {
    if (error?.code === '23505') return '同一道题已经有一条记录，请刷新后再编辑。';
    if (error?.name === 'QuotaExceededError') return '浏览器存储空间不足，请清理后重试。';
    return error?.message || '操作失败，请重试。';
  }
  async function run(action, trigger) {
    if (busy) return;
    busy = true; if (trigger) trigger.disabled = true;
    try { await action(); } catch (error) { message(errorText(error)); }
    finally { busy = false; if (trigger) trigger.disabled = false; }
  }
  async function refresh() {
    if (!store?.user || resetting) return;
    records = await store.list('study_records');
    favoritePaths = (await store.list('study_favorites')).map(row => row.page_path);
    changed();
    window.dispatchEvent(new Event('study-records-refreshed'));
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
    editing = true; panel().replaceChildren(el('p', 'STUDY NOTES', 'eyebrow'), el('h1', title));
    const form = el('form', undefined, 'editor-form'); panel().append(form); return form;
  }
  function formActions(form, label, submit) {
    const actions = el('div', undefined, 'actions');
    const save = el('button', label, 'button primary'); save.type = 'submit';
    actions.append(save, button('取消', () => { editing = false; render(); })); form.append(actions);
    form.onsubmit = event => { event.preventDefault(); run(() => submit(new FormData(form)), save); };
  }
  function editRecord(row) {
    const form = beginEdit(row ? '编辑学习记录' : '新增学习笔记');
    form.append(el('p', '笔记和答题记录只保存在当前浏览器，换设备或清理浏览器数据后会丢失。', 'description'));
    const title = field(form, '标题', 'title', row?.title); title.required = true; title.maxLength = 200;
    const path = field(form, '关联页面路径（可留空）', 'page_path', row?.page_path); path.maxLength = 500; path.readOnly = Boolean(row?.question_id);
    if (row?.question_id) form.append(el('p', `题目编号：${row.question_id}。答案与历史由每次实际提交记录；可在题目中点击「再做一次」。`, 'description'));
    select(form, '复习标记', 'marked', [['false', '未标记'], ['true', '已标记复习']], String(row?.marked || false));
    const note = field(form, '笔记', 'note', row?.note, 'textarea'); note.maxLength = 20000; note.rows = 7;
    formActions(form, '保存记录', async data => {
      const values = {title: data.get('title').trim(), page_path: data.get('page_path').trim(), note: data.get('note'), marked: data.get('marked') === 'true'};
      if (!values.title) throw new Error('请填写标题。');
      await store.save('study_records', values, row ? {id: row.id, version: row.updated_at} : {});
      editing = false; await refresh(); render(); message('学习记录已保存在本机浏览器。');
    });
    title.focus();
  }
  async function clearLearningData() {
    if (!confirm('第 1 次确认：清除当前浏览器里的全部答题记录、复习标记和笔记？')) return;
    if (!confirm('第 2 次确认：这些记录将永久清除，无法恢复。确定立即清除？')) return;
    resetting = true;
    try {
      await store.clearLearningData();
      records = []; favoritePaths = []; editing = false;
      try { localStorage.removeItem(`tmu-page-favorites:${location.pathname}`); } catch { /* The reset still succeeded. */ }
      changed(); render(); message('本机学习记录已清除，可以重新开始练习。');
    } finally { resetting = false; }
  }
  function renderRecords() {
    panel().append(el('h1', '学习记录'), el('p', '自动保存的答题记录与手动笔记，全部只保存在当前浏览器。清除浏览器数据会一并清空。', 'description'));
    const toolbar = el('div', undefined, 'record-tools');
    const search = el('input'); search.type = 'search'; search.placeholder = '搜索标题、页面或笔记'; search.setAttribute('aria-label', '搜索学习记录');
    const filter = el('select'); filter.setAttribute('aria-label', '记录筛选');
    for (const [value, name] of [['all','全部记录'],['wrong','错题'],['marked','标记复习'],['notes','笔记']]) { const o = el('option',name); o.value=value; filter.append(o); }
    toolbar.append(
      search, filter,
      button('新增笔记', () => editRecord()),
      button('刷新', e => run(async () => { await refresh(); render(); message('记录已刷新。'); }, e.target)),
      button('导出 JSON', () => download('学习记录.json', JSON.stringify(records, null, 2), 'application/json')),
      button('清除全部记录', e => run(clearLearningData, e.target), 'button danger')
    );
    const list = el('div', undefined, 'record-list'); panel().append(toolbar, list);
    const draw = () => {
      list.replaceChildren(); const query = search.value.trim().toLowerCase();
      const filtered = records.filter(r => `${r.title} ${r.page_path} ${r.note}`.toLowerCase().includes(query) && (filter.value === 'all' || filter.value === 'wrong' && r.submitted && r.correct === false || filter.value === 'marked' && r.marked || filter.value === 'notes' && !r.question_id)).sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      for (const row of filtered) {
        const card = el('article', undefined, 'record-card');
        const kind = row.question_id ? row.submitted ? (row.correct ? '答对' : '错题') : '未提交' : '笔记';
        card.append(el('p', `${kind}${row.marked ? ' · 已标记复习' : ''}`, 'eyebrow'), el('h2',row.title));
        if (row.selected !== null && row.selected !== undefined) card.append(el('p', `已选：${String.fromCharCode(65+row.selected)}`, 'description'));
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
  function render() {
    if (panel().hidden) return;
    const view = location.hash.slice(2);
    panel().replaceChildren(el('p','STUDY DATA','eyebrow')); editing = false;
    if (view === 'review') { renderReview(); return; }
    renderRecords();
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
  function currentRecords() { return records; }
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
    panel().append(el('h1','标记复习'),el('p','星标是手动收藏的复习题；待复习包含未做或最后一次答错的题。答对后会移出待复习，星标仍由你决定保留。记录保存在当前浏览器。','description'));
    const toolbar=el('div',undefined,'record-tools'),search=el('input');search.type='search';search.placeholder='搜索小节或题目';search.setAttribute('aria-label','搜索复习题目');search.value=reviewQuery;
    const tabs=el('div',undefined,'review-tabs'),list=el('div',undefined,'record-list');
    const questions=reviewQuestions();
    const modes=[['marked','标记复习',r=>r.marked],['pending','待复习（未做 / 错误）',r=>!r.submitted||r.correct!==true],['all','全部题目',()=>true]];
    for(const [value,label,predicate]of modes){const b=button(`${label} · ${questions.filter(predicate).length}`,()=>{reviewFilter=value;render();});b.setAttribute('aria-pressed',String(value===reviewFilter));tabs.append(b);}
    toolbar.append(search,button('刷新记录',e=>run(async()=>{await refresh();render();},e.target)));
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
  function validEvent(event) {
    return event && typeof event.question_id==='string' && typeof event.request_id==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(event.question_id) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.request_id) &&
      (event.action==='mark'&&typeof event.marked==='boolean'||event.action==='attempt'&&Number.isInteger(event.selected)&&event.selected>=0&&event.selected<=25&&typeof event.correct==='boolean');
  }
  const api = {
    get user(){return store?.user;}, get ready(){return ready;}, get configured(){return connected;},
    get pages(){return [];},
    get favorites(){return favoritePaths;},
    render, refresh, sectionFromHtml,
    setCatalog(value) { publicCatalog=value; },
    registerSection(path, section) {
      if(Array.isArray(section?.questions)&&section.questions.every(q=>/^[a-zA-Z0-9_-]{1,100}$/.test(q.id)&&typeof q.title==='string'))runtimeSections.set(path,section);
    },
    get markedCount(){return reviewQuestions().filter(q=>q.marked).length;},
    reviewQuestions,
    pending() { return []; },
    state(path) { return currentRecords().filter(r=>r.page_path===path && r.question_id).map(({question_id,selected,submitted,correct,marked,correct_count,wrong_count})=>({question_id,selected,submitted,correct,marked,correct_count,wrong_count})); },
    questionEvent(path,title,event) {
      if(resetting || !store || !validEvent(event) || typeof path!=='string' || path.length>500) return;
      const job={page_path:path,title:(typeof event.title==='string'&&event.title ? event.title : title).slice(0,200),event:{request_id:event.request_id,question_id:event.question_id,action:event.action,selected:event.selected,correct:event.correct,marked:event.marked,elapsed_seconds:event.elapsed_seconds}};
      return store.questionEvent(path, job.title, job.event).then(saved=>{
        records = records.filter(r=>r.id!==saved.id); records.push(saved);
        emitResult(job,{record:saved,saved:true});
        message('');
        changed();
      }).catch(error=>{
        message(errorText(error),true); emitResult(job,{error:errorText(error)});
      });
    },
    async favorite(path, marked) {
      if (!store?.user || resetting) return false;
      if (marked) await store.save('study_favorites',{page_path:path},{conflict:'page_path'});
      else await store.remove('study_favorites','page_path',path);
      favoritePaths = favoritePaths.filter(p=>p!==path); if(marked)favoritePaths.push(path);
      changed(); return true;
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
  document.getElementById('retry-sync').onclick = () => message('');
  window.addEventListener('beforeunload',e=>{if(editing){e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && store?.user && !editing && !busy) refresh().catch(e=>message(errorText(e))); });
  (async()=>{
    try {
      store=await window.connectStudyStore(); connected=Boolean(store);
      if(store){ await store.checkSession(); if(store.user) await refresh();
        store.client.auth.onAuthStateChange(()=>{/* no account sessions on the public site */});
      }
    } catch(error){initError=errorText(error);}
    ready=true;changed();render();
    if(initError) message(initError,true);
  })();
})();
