const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8');
const read = path => fs.readFileSync(path,'utf8');
const pause = () => new Promise(r=>setTimeout(r,20));
async function setup(t,{user=true,failSave=false}={}) {
  const dom = new JSDOM(html,{url:'https://example.test/repo/#/records',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window, d=w.document;const errors=[];w.addEventListener('error',e=>errors.push(e.error));t.after(()=>assert.deepEqual(errors,[]));
  const rows={study_records:[],study_pages:[],study_favorites:[]};const receipts=new Set();
  const client={user:user?{id:'owner',email:'owner@example.test'}:null,client:{auth:{onAuthStateChange:()=>{}}},checkSession:async()=>{},list:async table=>rows[table],
    save:async(table,values,{id}={})=>{if(failSave)throw Error('network error'); const row={note:'',selected:null,...rows[table].find(r=>r.id===id),id:id||w.crypto.randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...values};rows[table]=rows[table].filter(r=>r.id!==id);rows[table].push(row);return row;},
    questionEvent:async(path,title,event)=>{
      if(failSave)throw Error('network error');
      let row=rows.study_records.find(r=>r.page_path===path&&r.question_id===event.question_id);
      if(!row){row={id:w.crypto.randomUUID(),page_path:path,question_id:event.question_id,title,note:'',selected:null,submitted:false,correct:null,marked:false,correct_count:0,wrong_count:0,updated_at:new Date().toISOString()};rows.study_records.push(row);}
      if(!receipts.has(event.request_id)){if(event.action==='mark')row.marked=event.marked;else{row.selected=event.selected;row.correct=event.correct;row.submitted=true;row[event.correct?'correct_count':'wrong_count']++;}receipts.add(event.request_id);}return {...row};
    },
    clearLearningData:async()=>{if(failSave)throw Error('network error');rows.study_records=[];rows.study_favorites=[];},
    remove:async(table,key,value)=>{rows[table]=rows[table].filter(r=>r[key]!==value);},
    page:async id=>rows.study_pages.find(r=>r.id===id),
    logout:async()=>{client.user=null;}, login:async()=>{client.user={id:'owner',email:'owner@example.test'};return client.user;}};
  w.connectStudyCloud=async()=>client;w.confirm=()=>true;
  w.fetch=async()=>({ok:true,json:async()=>({title:'Test',pages:[],defaultPage:''})});
  w.eval(read('assets/personal.js'));w.eval(read('assets/app.js'));await pause();
  const click = text => {const b=[...d.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,`button ${text} exists`);b.click();return b;};
  const submit = async values => {const f=d.querySelector('#personal form');for(const [k,v]of Object.entries(values))f.elements.namedItem(k).value=v;f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();};
  return {w,d,rows,client,click,submit};
}
test('personal records support create, read, update, search and delete',async t=>{
 const {d,rows,click,submit,w}=await setup(t);
 click('新增笔记');await submit({title:'细胞周期',note:'第一版笔记',marked:'true'});
 assert.equal(rows.study_records.length,1);assert.match(d.querySelector('.record-card').textContent,/第一版笔记/);
 click('编辑');await submit({title:'细胞周期修订',note:'第二版笔记'});
 assert.equal(rows.study_records.length,1);assert.equal(rows.study_records[0].note,'第二版笔记');
 const search=d.querySelector('[aria-label="搜索学习记录"]');search.value='不匹配';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.record-card').length,0);
 search.value='修订';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.record-card').length,1);
 click('删除');await pause();assert.equal(rows.study_records.length,0);
});
test('private HTML supports create, render in isolated iframe, edit and delete',async t=>{
 const {w,d,rows,click,submit}=await setup(t);w.location.hash='#/manage';await pause();
 click('上传 HTML');await pause();await submit({title:'DNA',category:'基础科学',html:'<h1>私人页面</h1><script>window.x=1</script>'});
 assert.equal(rows.study_pages.length,1);assert.match(d.querySelector('.page-card').textContent,/基础科学\/DNA.html/);
 click('编辑');await pause();await submit({title:'DNA 复制'});assert.equal(rows.study_pages[0].title,'DNA 复制');
 w.location.hash=d.querySelector('.page-card a').hash;await pause();
 assert.match(d.querySelector('iframe').srcdoc,/私人页面/);assert.doesNotMatch(d.querySelector('iframe').getAttribute('sandbox'),/allow-same-origin/);
 w.location.hash='#/manage';await pause();click('删除');await pause();assert.equal(rows.study_pages.length,0);assert.equal(d.querySelectorAll('.page-link').length,0);
});
test('failed writes retain form contents and show unsaved error',async t=>{
 const {d,rows,click,submit}=await setup(t,{failSave:true});click('新增笔记');await submit({title:'不能丢失',note:'保留草稿'});
 assert.equal(rows.study_records.length,0);assert.equal(d.querySelector('[name=note]').value,'保留草稿');assert.match(d.querySelector('#sync-message').textContent,/尚未保存/);
});
test('unauthenticated management routes show login and no personal data',async t=>{
 const {w,d}=await setup(t,{user:false});assert.ok(d.querySelector('[name=password]'));assert.equal(d.querySelectorAll('.record-card').length,0);
 w.location.hash='#/manage';await pause();assert.ok(d.querySelector('[name=email]'));assert.equal(d.querySelectorAll('.page-card').length,0);
});
test('quiz saves validate fields, preserve notes and use stable question IDs',async t=>{
 const {w,rows}=await setup(t);const record={question_id:'q1',selected:1,correct:false,submitted:true,marked:false};
 w.Personal.saveAnswer('test.html','Test',record);await pause();assert.equal(rows.study_records.length,1);
 rows.study_records[0].note='保留笔记';w.Personal.saveAnswer('test.html','Test',{...record,marked:true});await pause();
 assert.equal(rows.study_records.length,1);assert.equal(rows.study_records[0].marked,true);assert.equal(rows.study_records[0].note,'保留笔记');
 w.Personal.saveAnswer('test.html','Test',{...record,selected:999});await pause();assert.equal(rows.study_records[0].selected,1);
 assert.equal(w.Personal.state('test.html')[0].question_id,'q1');
});
test('logout clears private catalog and iframe content',async t=>{
 const {w,d,rows,click}=await setup(t);rows.study_pages.push({id:'private1',title:'Secret',category:'Private',html:'secret',updated_at:'2026-01-01'});await w.Personal.refresh();
 w.location.hash='#/page/'+encodeURIComponent('私有/private1');await pause();assert.equal(d.querySelector('iframe').srcdoc,'secret');
 w.location.hash='#/account';await pause();click('退出登录');await pause();assert.equal(w.Personal.pages.length,0);assert.equal(d.querySelector('iframe').getAttribute('srcdoc'),null);
});
test('review lists untouched questions, separates marks from pending, and links to exact questions',async t=>{
 const {w,d,rows}=await setup(t);
 w.Personal.setCatalog([{path:'section.html',title:'细胞生物学',category:'基础科学',question_index:[{id:'q1',title:'已答对且标记'},{id:'q2',title:'未做'},{id:'q3',title:'答错'}]}]);
 rows.study_records.push({updated_at:new Date().toISOString(),id:'1',page_path:'section.html',question_id:'q1',title:'已答对且标记',submitted:true,correct:true,marked:true,correct_count:2,wrong_count:1},{updated_at:new Date().toISOString(),id:'3',page_path:'section.html',question_id:'q3',title:'答错',submitted:true,correct:false,marked:false,correct_count:0,wrong_count:1});
 await w.Personal.refresh();w.location.hash='#/review';await pause();
 assert.equal(d.querySelectorAll('.record-card').length,1);assert.match(d.querySelector('.record-card a').hash,/question=q1$/);
 const pending=[...d.querySelectorAll('.review-tabs button')].find(b=>b.textContent.includes('待复习'));pending.click();
 assert.equal(d.querySelectorAll('.record-card').length,2);assert.match(d.querySelector('.record-list').textContent,/未做/);assert.doesNotMatch(d.querySelector('.record-list').textContent,/已答对且标记/);
});
test('standard upload extracts all question metadata without executing the HTML',async t=>{
 const {w}=await setup(t);const source=read('templates/小节题库模板.html');
 const index=w.Personal.sectionFromHtml(source);assert.equal(index.questions.length,4);assert.equal(index.section,'细胞生物学');
 assert.equal(w.Personal.sectionFromHtml('<h1>普通 HTML</h1>'),null);
 assert.throws(()=>w.Personal.sectionFromHtml('<script id="quiz-data">bad</script>'),/JSON/);
});
test('cloud events preserve every submission and duplicate retries do not increment history',async t=>{
 const {w,rows}=await setup(t);const event={question_id:'q1',action:'attempt',selected:1,correct:false,request_id:w.crypto.randomUUID()};
 w.Personal.questionEvent('test.html','q1',event);w.Personal.questionEvent('test.html','q1',event);await pause();
 w.Personal.questionEvent('test.html','q1',{...event,request_id:w.crypto.randomUUID(),selected:0,correct:true});await pause();
 assert.equal(rows.study_records[0].correct_count,1);assert.equal(rows.study_records[0].wrong_count,1);assert.equal(rows.study_records[0].correct,true);
});
test('reset requires two confirmations and preserves HTML while clearing all learning state',async t=>{
 const {w,d,rows,click}=await setup(t);
 rows.study_pages.push({id:'keep',title:'Keep HTML',category:'Test',html:'<h1>Keep</h1>',updated_at:'2026-01-01',question_index:[{id:'q1',title:'Question'}]});
 w.Personal.questionEvent('私有/keep','Question',{question_id:'q1',request_id:w.crypto.randomUUID(),action:'attempt',selected:0,correct:true});await pause();
 await w.Personal.favorite('私有/keep',true);await w.Personal.refresh();
 w.location.hash='#/account';await pause();
 let calls=0;w.confirm=()=>{calls++;return false;};click('清除全部学习数据');await pause();
 assert.equal(calls,1);assert.equal(rows.study_records.length,1);
 calls=0;w.confirm=()=>++calls===1;click('清除全部学习数据');await pause();
 assert.equal(calls,2);assert.equal(rows.study_records.length,1);assert.equal(rows.study_favorites.length,1);
 calls=0;w.confirm=()=>{calls++;return true;};click('清除全部学习数据');await pause();
 assert.equal(calls,2);assert.equal(rows.study_records.length,0);assert.equal(rows.study_favorites.length,0);assert.equal(rows.study_pages[0].html,'<h1>Keep</h1>');
 assert.equal(w.Personal.state('私有/keep').length,0);assert.equal(w.Personal.favorites.length,0);assert.equal(w.Personal.pages.length,1);assert.equal(w.Personal.reviewQuestions()[0].submitted,undefined);
 assert.match(d.querySelector('#sync-message').textContent,/已清除.*HTML/);
});
test('reset failure retains records and HTML and allows retry',async t=>{
 const {w,d,rows,click}=await setup(t,{failSave:true});
 rows.study_records.push({id:'keep',title:'Keep',note:'note',updated_at:'2026-01-01'});await w.Personal.refresh();
 w.location.hash='#/account';await pause();const b=click('清除全部学习数据');await pause();
 assert.equal(rows.study_records.length,1);assert.equal(b.disabled,false);assert.match(d.querySelector('#sync-message').textContent,/网络/);
});
test('reset waits for in-flight answers before clearing their records',async t=>{
 const {w,rows,client,click}=await setup(t);let finish;
 const original=client.questionEvent;client.questionEvent=(...args)=>new Promise(resolve=>{finish=async()=>resolve(await original(...args));});
 w.Personal.questionEvent('section.html','Question',{question_id:'q1',request_id:w.crypto.randomUUID(),action:'attempt',selected:0,correct:true});await pause();
 w.location.hash='#/account';await pause();click('清除全部学习数据');await pause();
 assert.equal(w.Personal.pending('section.html').length,1);await finish();await pause();
 assert.equal(rows.study_records.length,0);assert.equal(w.Personal.pending('section.html').length,0);
});
