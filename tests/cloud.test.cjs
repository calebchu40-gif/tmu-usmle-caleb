const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const fs = require('node:fs');
function setup(t,result={data:{id:'row'},error:null}) {
 const dom=new JSDOM('',{url:'https://example.test',runScripts:'outside-only'});t.after(()=>dom.window.close());dom.window.eval(fs.readFileSync('assets/cloud.js','utf8'));
 const calls=[];const query={};for(const name of ['update','insert','upsert','eq','select','delete','order','range'])query[name]=(...args)=>{calls.push([name,...args]);return query;};
 query.maybeSingle=async()=>result;query.then=(resolve,reject)=>Promise.resolve(result).then(resolve,reject);
 const client={from:table=>{calls.push(['from',table]);return query;},auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null}),signOut:async()=>{calls.push(['signOut']);return {error:null};}}};
 const store=new dom.window.CloudStore(client);return {store,calls,client};
}
test('cloud API rejects unauthenticated mutations before issuing requests',async t=>{
 const {store,calls}=setup(t);await assert.rejects(()=>store.save('study_records',{title:'x'}),/请先登录/);assert.equal(calls.length,0);
});
test('versioned edits detect conflicts instead of reporting success',async t=>{
 const {store,calls}=setup(t,{data:null,error:null});store.user={id:'owner'};
 await assert.rejects(()=>store.save('study_records',{note:'new'},{id:'row',version:'old'}),/另一台设备/);
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='updated_at'&&c[2]==='old'));
});
test('login validates database ownership and signs out unlisted accounts',async t=>{
 const {store,calls}=setup(t,{data:null,error:null});await assert.rejects(()=>store.checkSession(),/没有此工作台/);assert.equal(store.user,null);assert.ok(calls.some(c=>c[0]==='signOut'));
});
test('insert binds data to current user; database errors propagate',async t=>{
 const {store,calls}=setup(t,{data:null,error:{message:'permission denied'}});store.user={id:'owner'};
 await assert.rejects(()=>store.save('study_pages',{title:'x',user_id:'other'}),e=>e.message==='permission denied');
 assert.equal(calls.find(c=>c[0]==='insert')[1].user_id,'owner');
});
test('question event uses a singular RPC result and includes the stable request ID',async t=>{
 const {store,client}=setup(t);store.user={id:'owner'};let args;
 client.rpc=(name,params)=>{args={name,params};return {single:async()=>({data:{id:'record',correct_count:2,wrong_count:1},error:null})};};
 const event={question_id:'q1',request_id:'11111111-1111-4111-8111-111111111111',action:'attempt',selected:0,correct:true};
 const row=await store.questionEvent('section.html','Question',event);
 assert.equal(args.name,'study_question_event');assert.equal(args.params.p_event,event.request_id);assert.equal(row.correct_count,2);
});
