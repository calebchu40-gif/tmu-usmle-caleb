const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8');
const read = path => fs.readFileSync(path,'utf8');
const pause = () => new Promise(r=>setTimeout(r,80));
async function setup(t,{failSave=false,url='https://example.test/repo/#/records',catalogPages=[]}={}) {
  const dom = new JSDOM(html,{url,runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window, d=w.document;const errors=[];w.addEventListener('error',e=>errors.push(e.error));t.after(()=>assert.deepEqual(errors,[]));
  const rows={study_records:[],study_favorites:[]};const receipts=new Set();
  const store={
    user:null,
    get client(){return {auth:{onAuthStateChange:()=>{}}}},
    async checkSession(){this.user={id:'local-browser'};return this.user;},
    async list(table){return (rows[table]||[]).map(row=>({...row}));},
    async save(table,values,{id,version}={}){
      if(failSave)throw Error('network error');
      const stamp=new Date().toISOString();
      if(id){
        const existing=rows[table].find(row=>row.id===id);
        if(!existing||(version&&existing.updated_at!==version))return null;
        Object.assign(existing,values,{updated_at:stamp});
        return {...existing};
      }
      const row={created_at:stamp,updated_at:stamp,...values,id:w.crypto.randomUUID()};
      rows[table]=(rows[table]||[]).concat([row]);return {...row};
    },
    async remove(table,key,value){rows[table]=(rows[table]||[]).filter(row=>row[key]!==value);},
    async questionEvent(path,title,event){
      if(failSave)throw Error('network error');
      let row=rows.study_records.find(r=>r.page_path===path&&r.question_id===event.question_id);
      if(!row){row={id:w.crypto.randomUUID(),page_path:path,question_id:event.question_id,title,note:'',selected:null,submitted:false,correct:null,marked:false,correct_count:0,wrong_count:0,updated_at:new Date().toISOString()};rows.study_records.push(row);}
      if(!receipts.has(event.request_id)){if(event.action==='mark')row.marked=event.marked;else{row.selected=event.selected;row.correct=event.correct;row.submitted=true;row[event.correct?'correct_count':'wrong_count']++;}receipts.add(event.request_id);}
      return {...row};
    },
    async clearLearningData(){if(failSave)throw Error('network error');rows.study_records=[];rows.study_favorites=[];},
  };
  w.connectStudyStore=async()=>store;w.confirm=()=>true;
  w.fetch=async()=>({ok:true,json:async()=>({title:'Test',pages:catalogPages,defaultPage:''})});
  w.eval(read('assets/personal.js'));w.eval(read('assets/app.js'));await pause();
  const click = text => {const b=[...d.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,`button ${text} exists`);b.click();return b;};
  const submit = async values => {const f=d.querySelector('#personal form');for(const [k,v]of Object.entries(values))f.elements.namedItem(k).value=v;f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();};
  return {w,d,rows,store,click,submit};
}
test('personal records support create, read, update, search and delete',async t=>{
 const {w,d,rows,click,submit}=await setup(t);
 click('新增笔记');await submit({title:'细胞周期',note:'第一版笔记',marked:'true'});
 assert.equal(rows.study_records.length,1);assert.match(d.querySelector('.record-card').textContent,/第一版笔记/);
 click('编辑');await submit({title:'细胞周期修订',note:'第二版笔记'});
 assert.equal(rows.study_records.length,1);assert.equal(rows.study_records[0].note,'第二版笔记');
 const search=d.querySelector('[aria-label="搜索学习记录"]');search.value='不匹配';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.record-card').length,0);
 search.value='修订';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.record-card').length,1);
 click('删除');await pause();assert.equal(rows.study_records.length,0);
});
test('the workbench has no login form and old account routes return to the overview',async t=>{
 const {w,d}=await setup(t);
 assert.equal(d.querySelector('#auth-gate'),null);assert.equal(d.querySelector('#entry-password'),null);assert.equal(d.querySelector('#auth-gate'),null);
 w.location.hash='#/account';await pause();
 assert.equal(w.location.hash,'#/overview');assert.equal(d.querySelector('#personal').hidden,true);
});
test('failed writes retain form contents and show an error',async t=>{
 const {d,rows,click,submit}=await setup(t,{failSave:true});click('新增笔记');await submit({title:'不能丢失',note:'保留草稿'});
 assert.equal(rows.study_records.length,0);assert.equal(d.querySelector('[name=note]').value,'保留草稿');assert.match(d.querySelector('#sync-message').textContent,/network error/);
});
test('quiz saves validate fields, preserve notes and use stable question IDs',async t=>{
 const {w,rows}=await setup(t);const record={question_id:'q1',selected:1,correct:false,submitted:true,marked:false};
 w.Personal.saveAnswer('test.html','Test',record);await pause();assert.equal(rows.study_records.length,1);
 rows.study_records[0].note='保留笔记';w.Personal.saveAnswer('test.html','Test',{...record,marked:true});await pause();
 assert.equal(rows.study_records.length,1);assert.equal(rows.study_records[0].marked,true);assert.equal(rows.study_records[0].note,'保留笔记');
 w.Personal.saveAnswer('test.html','Test',{...record,selected:999});await pause();assert.equal(rows.study_records[0].selected,1);
 assert.equal(w.Personal.state('test.html')[0].question_id,'q1');
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
test('duplicate retries do not increment the answer history',async t=>{
 const {w,rows}=await setup(t);const event={question_id:'q1',action:'attempt',selected:1,correct:false,request_id:w.crypto.randomUUID()};
 w.Personal.questionEvent('test.html','q1',event);w.Personal.questionEvent('test.html','q1',event);await pause();
 w.Personal.questionEvent('test.html','q1',{...event,request_id:w.crypto.randomUUID(),selected:0,correct:true});await pause();
 assert.equal(rows.study_records[0].correct_count,1);assert.equal(rows.study_records[0].wrong_count,1);assert.equal(rows.study_records[0].correct,true);
});
test('clearing local data requires two confirmations and empties records and favorites',async t=>{
 const {w,d,rows,click}=await setup(t);
 w.Personal.questionEvent('section.html','Question',{question_id:'q1',request_id:w.crypto.randomUUID(),action:'attempt',selected:0,correct:true});await pause();
 await w.Personal.favorite('section.html',true);await w.Personal.refresh();
 let calls=0;w.confirm=()=>{calls++;return false;};click('清除全部记录');await pause();
 assert.equal(calls,1);assert.equal(rows.study_records.length,1);
 calls=0;w.confirm=()=>++calls===1;click('清除全部记录');await pause();
 assert.equal(calls,2);assert.equal(rows.study_records.length,1);assert.equal(rows.study_favorites.length,1);
 calls=0;w.confirm=()=>{calls++;return true;};click('清除全部记录');await pause();
 assert.equal(calls,2);assert.equal(rows.study_records.length,0);assert.equal(rows.study_favorites.length,0);
 assert.equal(w.Personal.state('section.html').length,0);assert.equal(w.Personal.favorites.length,0);
 assert.match(d.querySelector('#sync-message').textContent,/已清除/);
});
test('clearing data failure retains records and allows retry',async t=>{
 const {w,d,rows,click}=await setup(t,{failSave:true});
 rows.study_records.push({id:'keep',title:'Keep',note:'note',updated_at:'2026-01-01'});await w.Personal.refresh();
 const b=click('清除全部记录');await pause();
 assert.equal(rows.study_records.length,1);assert.equal(b.disabled,false);assert.match(d.querySelector('#sync-message').textContent,/network/);
});
test('pages entered from the catalog open in the sandboxed viewer',async t=>{
 const {w,d}=await setup(t,{catalogPages:[{path:'基础科学/小节.html',title:'小节',category:'基础科学'}]});
 w.location.hash='#/page/'+encodeURIComponent('基础科学/小节.html');await pause();
 const frame=d.querySelector('#content-frame');
 assert.equal(decodeURIComponent(new URL(frame.src).pathname),'/repo/基础科学/小节.html');
 assert.doesNotMatch(frame.getAttribute('sandbox'),/allow-same-origin/);
});
