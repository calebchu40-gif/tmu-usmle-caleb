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
 answer(0,1);assert.equal(d.querySelector('#correct-count').textContent,'0');assert.equal(d.querySelector('#review-count').textContent,'4');
 retry(0);assert.equal(card(0).querySelector('.primary').disabled,true);answer(0,0);
 assert.equal(d.querySelector('#correct-count').textContent,'1');assert.equal(d.querySelector('#review-count').textContent,'3');
 retry(0);answer(0,2);
 assert.equal(d.querySelector('#correct-count').textContent,'0');assert.equal(d.querySelector('#review-count').textContent,'4');
 assert.match(card(0).querySelector('.history').textContent,/正确 1 次错误 2 次/);
 assert.equal(d.querySelector('#done-count').textContent,'1');
});
test('each question retains its own draft, submission, history, and mark',t=>{
 const {d,card,answer}=setup(t);card(1).querySelectorAll('.choice')[1].click();
 answer(0,0);assert.equal(card(1).querySelectorAll('.choice')[1].getAttribute('aria-checked'),'true');
 assert.equal(card(1).querySelector('.explanation'),null);card(1).querySelector('.primary').click();
 card(0).querySelector('.mark-button').click();card(0).querySelector('.mark-button').click();
 assert.equal(d.querySelector('#correct-count').textContent,'2');assert.equal(d.querySelector('#review-count').textContent,'2');
 assert.match(card(0).querySelector('.history').textContent,/正确 1 次错误 0 次/);
 assert.match(card(1).querySelector('.history').textContent,/正确 1 次错误 0 次/);
});
test('restoring saved state does not count as another answer',t=>{
 const saved=[{question_id:ids[0],selected:0,submitted:true,correct:true,marked:true,correct_count:5,wrong_count:2}];
 const {d,card,w}=setup(t,{saved});assert.match(card(0).querySelector('.history').textContent,/正确 5 次错误 2 次/);
 assert.equal(d.querySelector('#correct-count').textContent,'1');assert.equal(card(0).querySelector('.mark-button').getAttribute('aria-pressed'),'true');
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
