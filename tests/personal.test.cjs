const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('index.html','utf8');
const read = path => fs.readFileSync(path,'utf8');
const pause = () => new Promise(r=>setTimeout(r,20));
async function setup(t,{user=true,failSave=false}={}) {
  const dom = new JSDOM(html,{url:'https://example.test/repo/#/records',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window, d=w.document;
  const rows={study_records:[],study_pages:[],study_favorites:[]};
  const client={user:user?{id:'owner',email:'owner@example.test'}:null,client:{auth:{onAuthStateChange:()=>{}}},checkSession:async()=>{},list:async table=>rows[table],
    save:async(table,values,{id}={})=>{if(failSave)throw Error('network error'); const row={note:'',selected:null,...rows[table].find(r=>r.id===id),id:id||w.crypto.randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...values};rows[table]=rows[table].filter(r=>r.id!==id);rows[table].push(row);return row;},
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
test('both sample quizzes restore saved answers without writing duplicates',t=>{
 for(const [file,id,answer,done] of [['生物化学/新生儿黄疸与核黄素.html','neonatal-jaundice-riboflavin',3,'doneCount'],['基础科学/细胞周期与遗传信息.html','cell-cycle-dna-replication',0,'done']]){
 let restore,saves=[];
 const dom=new JSDOM(read(file),{url:'https://example.test/test.html?embedded=1',runScripts:'dangerously',beforeParse(w){w.StudyBridge={onRestore:fn=>restore=fn,save:r=>saves.push(r)};}});t.after(()=>dom.window.close());
 assert.equal(typeof restore,'function');restore([{question_id:id,selected:answer,submitted:true,marked:false}]);
 assert.match(dom.window.document.getElementById(done).textContent,/1/);assert.equal(saves.length,0);
 }
});
