const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
const pages = [
  { path: 'biochemistry/riboflavin.html', title: '学习题库', category: '生物化学' },
  { path: '分类/章节 #1.html', title: '<img src=x onerror=alert(1)>', category: '基础科学' },
];
const delay = () => new Promise(resolve => setTimeout(resolve, 15));
async function setup(t, { hash = '', fail = false, saved = null, catalogPages = pages } = {}) {
  const dom = new JSDOM(html, { url: `https://example.test/tmu-usmle-caleb/${hash}`, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  if (saved !== null) w.localStorage.setItem('tmu-page-favorites:/tmu-usmle-caleb/', saved);
  w.fetch = async () => ({ ok: !fail, status: fail ? 404 : 200, json: async () => ({ title: 'Test Library', defaultPage: 'biochemistry/riboflavin.html', pages: catalogPages }) });
  w.eval(script);
  await delay();
  return { w, d: w.document };
}

test('default route preserves the original workspace overview', async t => {
  const { w, d } = await setup(t);
  assert.equal(w.location.hash, '#/overview');
  assert.equal(d.querySelectorAll('.page-link').length, 2);
  assert.equal(d.querySelector('#overview').hidden, false);
  d.querySelector('.skip').click();
  assert.equal(w.location.hash, '#/overview');
});

test('qbank remains a categorized page but opens directly, avoiding nested workbench navigation', async t => {
  const qbankPages=[...pages,{path:'qbank.html',title:'USMLE Step 1 KAPLAN题库',category:'USMLE Step 1'}];
  const { d } = await setup(t,{hash:'#/overview',catalogPages:qbankPages});
  const qbankLink=[...d.querySelectorAll('.page-link')].find(a=>a.textContent==='USMLE Step 1 KAPLAN题库');
  assert.ok(qbankLink);
  assert.equal(qbankLink.href,'https://example.test/tmu-usmle-caleb/qbank.html');
  const qbankCard=[...d.querySelectorAll('.page-card')].find(a=>a.querySelector('h2')?.textContent==='USMLE Step 1 KAPLAN题库');
  assert.equal(qbankCard.querySelector('a.button').href,'https://example.test/tmu-usmle-caleb/qbank.html');
});

test('shared routes handle nested Chinese filenames, spaces and hash characters', async t => {
  const hash = '#/page/' + encodeURIComponent(pages[1].path);
  const { w, d } = await setup(t, { hash });
  const url = new URL(d.querySelector('#content-frame').src);
  assert.equal(decodeURIComponent(url.pathname), '/tmu-usmle-caleb/分类/章节 #1.html');
  assert.equal(url.hash, '');
  assert.equal(d.querySelector('#page-title').textContent, pages[1].title);
  assert.equal(d.querySelector('#page-title img'), null);
  w.location.hash = '#/overview'; await delay();
  assert.equal(d.querySelector('#overview').hidden, false);
  w.location.hash = hash; await delay();
  assert.equal(d.querySelector('#viewer').hidden, false);
});

test('search filters the directory and overview; no matches has a clear message', async t => {
  const { w, d } = await setup(t, { hash: '#/overview' });
  const search = d.querySelector('#search');
  search.value = '生物化学'; search.dispatchEvent(new w.Event('input'));
  assert.equal(d.querySelectorAll('.page-link').length, 1);
  assert.equal(d.querySelectorAll('.page-card').length, 1);
  search.value = 'no-such-page'; search.dispatchEvent(new w.Event('input'));
  assert.equal(d.querySelectorAll('.page-card').length, 0);
  assert.match(d.querySelector('.empty-state').textContent, /没有找到/);
});

test('favorites persist across loads, can be removed, and tolerate corrupt storage', async t => {
  const pageHash='#/page/biochemistry%2Friboflavin.html';
  const { w, d } = await setup(t, { hash:pageHash, saved: '{broken' });
  d.querySelector('#favorite-button').click();
  const saved = w.localStorage.getItem('tmu-page-favorites:/tmu-usmle-caleb/');
  assert.deepEqual(JSON.parse(saved), ['biochemistry/riboflavin.html']);
  const reloaded = await setup(t, { hash:pageHash, saved });
  assert.equal(reloaded.d.querySelector('#favorite-button').getAttribute('aria-pressed'), 'true');
  w.location.hash = '#/favorites'; await delay();
  assert.equal(d.querySelectorAll('.page-card').length, 1);
  reloaded.d.querySelector('#favorite-button').click();
  assert.equal(reloaded.d.querySelector('#favorite-count').textContent, '0');
});

test('deleted or malformed routes and failed manifest loads show recoverable errors', async t => {
  for (const hash of ['#/page/missing.html', '#/page/%E0%A4']) {
    const { w, d } = await setup(t, { hash });
    assert.equal(d.querySelector('#error').hidden, false);
    w.location.hash = '#/overview'; await delay();
    assert.equal(d.querySelector('#error').hidden, true);
  }
  const failed = await setup(t, { fail: true });
  assert.match(failed.d.querySelector('#error-title').textContent, /无法加载目录/);
});

test('mobile navigation opens and closes with selection or Escape', async t => {
  const { w, d } = await setup(t);
  d.querySelector('#menu-toggle').click();
  assert.equal(d.querySelector('#menu-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(d.querySelector('#backdrop').hidden, false);
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(d.querySelector('#backdrop').hidden, true);
  d.querySelector('#menu-toggle').click();
  d.querySelector('.page-link').click();
  await delay();
  assert.equal(d.querySelector('#menu-toggle').getAttribute('aria-expanded'), 'false');
});

test('sharing copies the framework URL and reports unavailable clipboard access', async t => {
  const { w, d } = await setup(t);
  let copied;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async value => { copied = value; } } });
  d.querySelector('#share-button').click(); await delay();
  assert.equal(copied, w.location.href);
  w.navigator.clipboard.writeText = async () => { throw Error('denied'); };
  d.querySelector('#share-button').click(); await delay();
  assert.match(d.querySelector('#status').textContent, /未能自动复制/);
});

test('both section files contain independent questions and per-question submit buttons', t => {
  for (const [file, answer] of [['生物化学/新生儿黄疸与核黄素.html', 3], ['基础科学/细胞周期与遗传信息.html', 0]]) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'), { url: `https://example.test/${file}`, runScripts: 'dangerously' });
    t.after(() => dom.window.close());
    const d=dom.window.document,cards=d.querySelectorAll('.question-card');
    assert.equal(cards.length,4); assert.equal(d.querySelector('#review-questions').textContent,'1，2，3，4');
    assert.equal(cards[0].querySelector('.primary').disabled,true);
    cards[0].querySelectorAll('.choice')[answer].click();cards[0].querySelector('.primary').click();
    assert.match(cards[0].querySelector('.explanation').textContent,/回答正确/);
    assert.equal(cards[1].querySelector('.explanation'),null);
    assert.equal(d.querySelector('#done-count').textContent,'1');
    assert.equal(d.querySelector('#review-questions').textContent,'2，3，4');
  }
});
test('standalone view keeps the same page route, sandbox and cloud message bridge',async t=>{
 const {w,d}=await setup(t,{hash:'?view=standalone#/page/biochemistry%2Friboflavin.html'});
 assert.ok(d.documentElement.classList.contains('standalone'));assert.equal(d.querySelector('#workspace-link').href,'https://example.test/tmu-usmle-caleb/#/page/biochemistry%2Friboflavin.html');
 assert.equal(d.querySelector('#content-frame').src,'https://example.test/tmu-usmle-caleb/biochemistry/riboflavin.html?embedded=1');assert.doesNotMatch(d.querySelector('iframe').getAttribute('sandbox'),/allow-same-origin/);
 let saved,restored;w.Personal={user:{id:'owner'},ready:true,registerSection:()=>{},pending:()=>[],state:()=>[{question_id:'q1',correct:true}],questionEvent:(...args)=>{saved=args;}};
 const frame=d.querySelector('iframe').contentWindow;frame.postMessage=data=>{restored=data;};
 w.dispatchEvent(new w.MessageEvent('message',{source:frame,data:{channel:'tmu-study-v2',type:'ready'}}));assert.equal(restored.signedIn,true);assert.equal(restored.records[0].question_id,'q1');
 w.dispatchEvent(new w.MessageEvent('message',{source:frame,data:{channel:'tmu-study-v2',type:'question-event',event:{question_id:'q1'}}}));assert.equal(saved[0],'biochemistry/riboflavin.html');
 w.dispatchEvent(new w.Event('study-records-refreshed'));assert.equal(restored.type,'sync');
});
test('direct hosted HTML routes into the cloud viewer; embedded and offline files do not redirect',()=>{
 const vm=require('node:vm'),code=fs.readFileSync('assets/open-standalone.js','utf8');
 const run=(embedded,protocol)=>{let target;const w={};w.parent=embedded?{}:w;vm.runInNewContext(code,{window:w,URL,location:{protocol,origin:'https://example.test',pathname:'/repo/%E5%88%86%E7%B1%BB/a%20b.html',replace:value=>{target=value;}},document:{currentScript:{src:'https://example.test/repo/assets/open-standalone.js'}}});return target;};
 assert.equal(run(false,'https:'),'https://example.test/repo/?view=standalone#/page/%E5%88%86%E7%B1%BB%2Fa%20b.html');assert.equal(run(true,'https:'),undefined);assert.equal(run(false,'file:'),undefined);
});
