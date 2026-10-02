(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const node = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n; };
  const button = (text, cls, click) => {const b=node('button',text,cls);b.type='button';b.onclick=click;return b;};
  const letter = i => String.fromCharCode(65+i);
  const embedded = parent !== window;
  let config;
  try {
    config=JSON.parse($('quiz-data').textContent);
    const ids=new Set();
    if(config.version!==2 || !config.id || !config.category || !config.section || !Array.isArray(config.questions) || !config.questions.length)throw Error('缺少小节信息或题目。');
    for(const q of config.questions){
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(q.id)||ids.has(q.id)||!q.title||!q.stem||!Array.isArray(q.options)||q.options.length<2||q.options.length>26||!q.options.every(x=>typeof x==='string')||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length||!q.explanation||!Array.isArray(q.optionExplanations)||q.optionExplanations.length!==q.options.length)throw Error('题目字段不完整，或题目 ID 重复：'+(q.id||'未命名'));
      ids.add(q.id);
    }
  }catch(error){document.body.replaceChildren(node('p','模板数据错误：'+error.message,'template-error'));return;}
  const states=new Map(), drafts=new Map(), retrying=new Set(), pending=new Map(), feedback=new Map(), cards=new Map();
  const empty = id => ({question_id:id,selected:null,submitted:false,correct:null,marked:false,correct_count:0,wrong_count:0});
  let ready=!embedded, mode=embedded?'connecting':'local';
  const storageKey=`tmu-section-v2:${config.id}`;
  for(const q of config.questions)states.set(q.id,empty(q.id));
  function restore(rows){
    for(const q of config.questions){
      const r=rows.find(x=>x.question_id===q.id);
      if(!r){states.set(q.id,empty(q.id));continue;}
      const submitted=Boolean(r.submitted)&&Number.isInteger(r.selected)&&r.selected>=0&&r.selected<q.options.length;
      states.set(q.id,{...empty(q.id),...r,submitted,selected:submitted?r.selected:null,correct:submitted?r.correct===true:null,correct_count:Math.max(0,Number(r.correct_count)||0),wrong_count:Math.max(0,Number(r.wrong_count)||0)});
    }
  }
  if(!embedded){try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))restore(saved);}catch{/* Can still practice without local storage. */}}
  document.title=`${config.category} · ${config.section}`;
  $('section-category').textContent=config.category;$('section-title').textContent=config.section;$('section-description').textContent=config.description||'逐题提交，随时复习。';
  $('knowledge-path').append(node('li',config.category),node('li',config.section));
  function updateMode(){
    $('mode-note').textContent=mode==='cloud'?'已登录 · 答题与标记保存到云端':mode==='session'?'未登录 · 仅本次窗口保留记录':mode==='local'?'独立打开 · 记录仅保存在本机浏览器':'正在恢复学习记录…';
  }
  function focusQuestion(id){
    const card=cards.get(id);if(!card)return;
    document.querySelectorAll('.question-card.focused').forEach(n=>n.classList.remove('focused'));
    card.classList.add('focused');card.scrollIntoView?.({behavior:'smooth',block:'start'});card.focus({preventScroll:true});
  }
  function updateStats(){
    const rows=[...states.values()],done=rows.filter(r=>r.submitted).length,correct=rows.filter(r=>r.submitted&&r.correct).length;
    $('done-count').textContent=done;$('total-count').textContent=rows.length;$('correct-count').textContent=correct;$('review-count').textContent=rows.length-correct;
    $('progress-fill').style.width=`${done/rows.length*100}%`;
    $('question-map').replaceChildren();
    config.questions.forEach((q,i)=>{
      const state=states.get(q.id),b=button(String(i+1).padStart(2,'0'),state.marked?'marked':'',()=>focusQuestion(q.id));
      b.dataset.state=state.submitted?(state.correct?'correct':'wrong'):'unanswered';b.setAttribute('aria-label',`第 ${i+1} 题 ${q.title} · ${state.submitted?(state.correct?'答对':'错误'):'未做'}${state.marked?' · 已标记':''}`);$('question-map').append(b);
    });
    $('marked-count').textContent=rows.filter(r=>r.marked).length;
  }
  function renderCard(q,index){
    const card=cards.get(q.id),s=states.get(q.id),edit=!s.submitted||retrying.has(q.id),job=pending.get(q.id),selection=drafts.has(q.id)?drafts.get(q.id):retrying.has(q.id)?null:s.selected;
    card.replaceChildren();
    const toolbar=node('div',undefined,'question-toolbar'),num=node('div',undefined,'question-number');num.append('练习题 ',node('b',String(index+1).padStart(2,'0')),` / ${String(config.questions.length).padStart(2,'0')}`);
    const tools=node('div',undefined,'question-tools'),history=node('div',undefined,'history');history.append(node('span','答题历史'),node('span',`正确 ${s.correct_count} 次`,'right'),node('span',`错误 ${s.wrong_count} 次`,'wrong'));history.setAttribute('aria-label',`答题历史：正确 ${s.correct_count} 次，错误 ${s.wrong_count} 次`);
    const mark=button(s.marked?'★ 已标记':'☆ 标记复习','mark-button',()=>send(q,{action:'mark',marked:!s.marked}));mark.setAttribute('aria-pressed',String(s.marked));mark.disabled=!ready||Boolean(job);tools.append(history,mark);toolbar.append(num,tools);
    const body=node('div',undefined,'question-body'),tags=node('div',undefined,'tags');for(const tag of [config.category,config.section])tags.append(node('span',tag,'tag'));
    body.append(tags,node('h2',q.title,'question-title'),node('p',q.stem,'stem'));
    const choices=node('div',undefined,'choices');choices.setAttribute('role','radiogroup');choices.setAttribute('aria-label',`${q.title} 答案选项`);
    q.options.forEach((text,i)=>{
      const b=button('',`choice${selection===i?' selected':''}`,()=>{drafts.set(q.id,i);renderCard(q,index);cards.get(q.id).querySelectorAll('.choice')[i].focus();});
      b.setAttribute('role','radio');b.setAttribute('aria-checked',String(selection===i));b.disabled=!ready||!edit||Boolean(job);
      if(s.submitted&&!edit){if(i===q.answer)b.classList.add('correct');else if(i===s.selected)b.classList.add('incorrect');}
      b.append(node('span',letter(i),'letter'),node('span',text));choices.append(b);
    });body.append(choices);
    const footer=node('div',undefined,'question-footer'),hint=node('span',undefined,'answer-status');hint.setAttribute('role','status');
    if(job){hint.textContent=feedback.get(q.id)||'正在保存这一题…';if(job.failed)hint.classList.add('error');}
    else if(feedback.has(q.id))hint.textContent=feedback.get(q.id);
    else hint.textContent=!ready?'正在读取记录…':edit?'选择一个最合适的答案，再提交本题。':s.correct?'最后一次：答对':'最后一次：错误，待复习';
    const actions=node('div',undefined,'answer-actions');
    if(job?.failed)actions.append(button('重试保存','btn',()=>{job.failed=false;feedback.delete(q.id);post(job);renderCard(q,index);}));
    if(s.submitted&&!edit)actions.append(button('再做一次','btn',()=>{retrying.add(q.id);drafts.delete(q.id);feedback.delete(q.id);renderCard(q,index);}));
    const submit=button(edit?'提交本题':'已提交','btn primary',()=>send(q,{action:'attempt',selected:selection,correct:selection===q.answer}));submit.disabled=!ready||!edit||!Number.isInteger(selection)||Boolean(job);actions.append(submit);footer.append(hint,actions);card.append(toolbar,body,footer);
    if(s.submitted&&!edit){
      const exp=node('section',undefined,'explanation');exp.append(node('p',s.correct?'✓ 回答正确':`× 回答错误 · 正确答案 ${letter(q.answer)}`,`result${s.correct?'':' bad'}`),node('p',q.explanation),node('h3','选项逐项解析'));
      const reasons=node('div',undefined,'rationale');q.options.forEach((o,i)=>{const p=node('p',undefined,i===q.answer?'is-correct':'');p.append(node('strong',`${letter(i)} · ${o}`),node('span',q.optionExplanations[i]));reasons.append(p);});exp.append(reasons);
      if(q.point)exp.append(node('p',`考点：${q.point}`,'point'));if(q.clinicalNote)exp.append(node('p',q.clinicalNote,'clinical-note'));
      const refs=node('div',undefined,'references');for(const ref of q.references||[]){if(!/^https:\/\//.test(ref.url))continue;const a=node('a',ref.label);a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';refs.append(a);}exp.append(refs);card.append(exp);
    }
  }
  config.questions.forEach((q,i)=>{const card=node('article',undefined,'question-card');card.id=`question-${q.id}`;card.dataset.questionId=q.id;card.tabIndex=-1;cards.set(q.id,card);$('question-list').append(card);renderCard(q,i);});
  function localEvent(q,event){
    const state={...states.get(q.id)};
    if(event.action==='mark')state.marked=event.marked;
    else{state.selected=event.selected;state.correct=event.correct;state.submitted=true;state[event.correct?'correct_count':'wrong_count']++;}
    return state;
  }
  function send(q,data){
    if(pending.has(q.id)||!ready)return;
    const event={...data,request_id:crypto.randomUUID(),question_id:q.id,title:q.title};
    pending.set(q.id,event);feedback.delete(q.id);renderCard(q,config.questions.indexOf(q));
    if(embedded)post(event);
    else{
      states.set(q.id,localEvent(q,event));pending.delete(q.id);if(event.action==='attempt'){retrying.delete(q.id);drafts.delete(q.id);}
      try{localStorage.setItem(storageKey,JSON.stringify([...states.values()]));feedback.set(q.id,'已保存在本机浏览器。');}catch{feedback.set(q.id,'浏览器无法保存，当前仅保留本次练习。');}
      renderCard(q,config.questions.indexOf(q));updateStats();
    }
  }
  function post(event){parent.postMessage({channel:'tmu-study-v2',type:'question-event',event},'*');}
  window.addEventListener('message',e=>{
    if(e.source!==parent||e.data?.channel!=='tmu-study-v2')return;
    const data=e.data;
    if(data.type==='restore'){
      ready=true;mode=data.signedIn?'cloud':'session';restore(Array.isArray(data.records)?data.records:[]);
      for(const event of data.pending||[])if(states.has(event.question_id))pending.set(event.question_id,{...event,failed:true});
      config.questions.forEach(renderCard);updateStats();updateMode();$('connect-retry').hidden=true;
      if(data.focusQuestion)focusQuestion(data.focusQuestion);
    }
    if(data.type==='focus')focusQuestion(data.question_id);
    if(data.type==='result'){
      const q=config.questions.find(q=>q.id===data.question_id);if(!q)return;
      const job=pending.get(q.id);
      if(data.error){if(job&&job.request_id===data.request_id){job.failed=true;feedback.set(q.id,data.error);} }
      else{
        if(data.record)states.set(q.id,{...empty(q.id),...data.record});
        if(job?.request_id===data.request_id){pending.delete(q.id);if(job.action==='attempt'){retrying.delete(q.id);drafts.delete(q.id);}feedback.set(q.id,data.saved?'已保存到云端。':'仅本次窗口保留；登录后可跨设备保存。');}
      }
      renderCard(q,config.questions.indexOf(q));updateStats();
    }
  });
  const announce=()=>parent.postMessage({channel:'tmu-study-v2',type:'ready',section:{id:config.id,category:config.category,title:config.section,questions:config.questions.map(q=>({id:q.id,title:q.title}))}},'*');
  $('connect-retry').onclick=announce;
  $('review-link').onclick=()=>{if(embedded)parent.postMessage({channel:'tmu-study-v2',type:'review'},'*');else{const first=config.questions.find(q=>states.get(q.id).marked);if(first)focusQuestion(first.id);}};
  updateMode();updateStats();
  if(embedded){announce();setTimeout(()=>{if(!ready){$('mode-note').textContent='记录连接未完成，请点击重试。';$('connect-retry').hidden=false;}},8000);}
})();
