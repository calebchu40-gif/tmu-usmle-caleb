const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('基础科学/细胞周期与遗传信息.html','utf8');
const ids=['cell-cycle-dna-replication','cell-biology-transcription','cell-biology-translation','cell-biology-dna-repair'];
function setup(t,{saved,embedded=false}={}){
 const outbound=[],fakeParent={postMessage:data=>outbound.push(data)};
 const dom=new JSDOM(html,{url:'https://example.test/section.html',runScripts:'dangerously',beforeParse(w){
   if(saved)w.localStorage.setItem('tmu-section-v2:basic-science-cell-biology',JSON.stringify(saved));
   if(embedded)Object.defineProperty(w,'parent',{value:fakeParent});
 }});t.after(()=>dom.window.close());
 const w=dom.window,d=w.document;
 const receive=data=>w.dispatchEvent(new w.MessageEvent('message',{source:fakeParent,data:{channel:'tmu-study-v2',...data}}));
 const card=i=>d.querySelectorAll('.question-card')[i];
 const answer=(i,option)=>{card(i).querySelectorAll('.choice')[option].click();card(i).querySelector('.primary').click();};
 const retry=i=>[...card(i).querySelectorAll('button')].find(b=>b.textContent==='再做一次').click();
 return {w,d,card,answer,retry,outbound,receive};
}
test('wrong → correct → wrong changes last-state totals, while history accumulates',t=>{
 const {d,card,answer,retry}=setup(t);
 answer(0,1);assert.equal(d.querySelector('#correct-questions').textContent,'暂无');assert.equal(d.querySelector('#review-questions').textContent,'1，2，3，4');
 retry(0);assert.equal(card(0).querySelector('.primary').disabled,true);answer(0,0);
 assert.equal(d.querySelector('#correct-questions').textContent,'1');assert.equal(d.querySelector('#review-questions').textContent,'2，3，4');
 retry(0);answer(0,2);
 assert.equal(d.querySelector('#correct-questions').textContent,'暂无');assert.equal(d.querySelector('#review-questions').textContent,'1，2，3，4');
 assert.match(card(0).querySelector('.history').textContent,/正确 1 次错误 2 次/);
 assert.equal(d.querySelector('#done-count').textContent,'1');
});
test('each question retains its own draft, submission, history, and mark',t=>{
 const {d,card,answer}=setup(t);card(1).querySelectorAll('.choice')[1].click();
 answer(0,0);assert.equal(card(1).querySelectorAll('.choice')[1].getAttribute('aria-checked'),'true');
 assert.equal(card(1).querySelector('.explanation'),null);card(1).querySelector('.primary').click();
 card(0).querySelector('.mark-button').click();card(0).querySelector('.mark-button').click();
 assert.equal(d.querySelector('#correct-questions').textContent,'1，2');assert.equal(d.querySelector('#review-questions').textContent,'3，4');
 assert.match(card(0).querySelector('.history').textContent,/正确 1 次错误 0 次/);
 assert.match(card(1).querySelector('.history').textContent,/正确 1 次错误 0 次/);
});
test('restoring saved state does not count as another answer',t=>{
 const saved=[{question_id:ids[0],selected:0,submitted:true,correct:true,marked:true,correct_count:5,wrong_count:2}];
 const {d,card,w}=setup(t,{saved});assert.match(card(0).querySelector('.history').textContent,/正确 5 次错误 2 次/);
 assert.equal(d.querySelector('#correct-questions').textContent,'1');assert.equal(card(0).querySelector('.mark-button').getAttribute('aria-pressed'),'true');
 assert.deepEqual(JSON.parse(w.localStorage.getItem('tmu-section-v2:basic-science-cell-biology')),saved);
});
test('embedded mode waits for restore, submits one question, and retries the same event ID',t=>{
 const {card,answer,outbound,receive}=setup(t,{embedded:true});assert.equal(card(0).querySelectorAll('.choice')[0].disabled,true);
 assert.equal(outbound[0].section.questions.length,4);receive({type:'restore',records:[],signedIn:true});answer(0,0);
 const event=outbound.at(-1).event;assert.equal(event.question_id,ids[0]);assert.equal(event.action,'attempt');
 assert.match(card(0).querySelector('.history').textContent,/正确 0 次/);
 receive({type:'result',question_id:ids[0],request_id:event.request_id,error:'网络中断'});
 [...card(0).querySelectorAll('button')].find(b=>b.textContent==='重试保存').click();assert.equal(outbound.at(-1).event.request_id,event.request_id);
 receive({type:'result',question_id:ids[0],request_id:event.request_id,saved:true,record:{question_id:ids[0],selected:0,correct:true,submitted:true,marked:false,correct_count:1,wrong_count:0}});
 assert.match(card(0).querySelector('.history').textContent,/正确 1 次/);assert.match(card(0).textContent,/已保存到云端/);
 assert.equal(card(1).querySelector('.explanation'),null);
});
test('template output is self-contained and has the fixed sidebar / scroll column contract',()=>{
 const template=fs.readFileSync('templates/小节题库模板.html','utf8');
 assert.doesNotMatch(template,/<script[^>]+src=|<link[^>]+stylesheet/);
 assert.match(template,/\.question-scroll\{[^}]*height:100%[^}]*overflow-y:auto/);
 assert.match(template,/\.quiz-shell\{[^}]*height:100dvh/);
 assert.match(template,/\.quiz-columns\{display:grid/);
 assert.ok(template.includes('待复习 = 未做 + 最后一次答错'));
});
test('manual refresh unlocks every question and clears drafts without changing saved history or statistics',t=>{
 const saved=[{question_id:ids[0],selected:0,submitted:true,correct:true,marked:true,correct_count:5,wrong_count:2},{question_id:ids[1],selected:0,submitted:true,correct:false,marked:false,correct_count:1,wrong_count:3}];
 const {w,d,card,answer}=setup(t,{saved});
 assert.equal(card(0).querySelector('.choice').disabled,true);assert.ok(card(0).querySelector('.explanation'));
 card(2).querySelector('.choice').click();d.querySelector('#refresh-questions').click();
 for(let i=0;i<4;i++){assert.equal(card(i).querySelector('.choice').disabled,false);assert.equal(card(i).querySelector('[aria-checked=true]'),null);assert.equal(card(i).querySelector('.explanation'),null);assert.equal(card(i).querySelector('.primary').disabled,true);}
 assert.equal(d.querySelector('#correct-questions').textContent,'1');assert.equal(d.querySelector('#review-questions').textContent,'2，3，4');assert.equal(d.querySelector('#done-count').textContent,'2');
 assert.equal(card(0).querySelector('.mark-button').getAttribute('aria-pressed'),'true');assert.deepEqual(JSON.parse(w.localStorage.getItem('tmu-section-v2:basic-science-cell-biology')),saved);
 answer(0,1);assert.match(card(0).querySelector('.history').textContent,/正确 5 次错误 3 次/);assert.equal(d.querySelector('#correct-questions').textContent,'暂无');assert.equal(d.querySelector('#review-questions').textContent,'1，2，3，4');assert.ok(card(0).querySelector('.explanation'));
});
test('manual refresh sends no cloud writes and waits for pending saves',t=>{
 const {d,card,answer,outbound,receive}=setup(t,{embedded:true});const refresh=d.querySelector('#refresh-questions');assert.equal(refresh.disabled,true);
 receive({type:'restore',records:[],signedIn:true});assert.equal(refresh.disabled,false);answer(0,0);const event=outbound.at(-1).event;assert.equal(refresh.disabled,true);
 receive({type:'result',question_id:ids[0],request_id:event.request_id,error:'断网'});assert.equal(refresh.disabled,true);
 receive({type:'result',question_id:ids[0],request_id:event.request_id,saved:true,record:{question_id:ids[0],selected:0,correct:true,submitted:true,marked:false,correct_count:1,wrong_count:0}});
 assert.equal(refresh.disabled,false);const count=outbound.length;refresh.click();assert.equal(outbound.length,count);assert.equal(card(0).querySelector('.choice').disabled,false);
});
test('every generated HTML uses the manual refresh card in place of the knowledge path',()=>{
 for(const path of ['基础科学/细胞周期与遗传信息.html','生物化学/新生儿黄疸与核黄素.html','templates/小节题库模板.html','tests/fixtures/上传测试小节.html']){
  const content=fs.readFileSync(path,'utf8');assert.match(content,/id="refresh-questions"/);assert.doesNotMatch(content,/id="knowledge-path"/);
 }
});
test('question lists show ordered question numbers, follow latest results and support jumping',t=>{
 const saved=[{question_id:ids[2],selected:2,submitted:true,correct:true,correct_count:1},{question_id:ids[0],selected:0,submitted:true,correct:true,correct_count:3},{question_id:ids[1],selected:0,submitted:true,correct:false,wrong_count:1}];
 const {d,card,answer,retry}=setup(t,{saved});
 assert.equal(d.querySelector('#correct-questions').textContent,'1，3');assert.equal(d.querySelector('#review-questions').textContent,'2，4');
 d.querySelectorAll('#review-questions button')[1].click();assert.equal(d.activeElement,card(3));assert.ok(card(3).classList.contains('focused'));
 retry(1);answer(1,1);assert.equal(d.querySelector('#correct-questions').textContent,'1，2，3');assert.equal(d.querySelector('#review-questions').textContent,'4');
 answer(3,3);assert.equal(d.querySelector('#correct-questions').textContent,'1，2，3，4');assert.equal(d.querySelector('#review-questions').textContent,'暂无');
});
