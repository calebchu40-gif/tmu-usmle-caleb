const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

function setup(t) {
  const dom = new JSDOM('', {url: 'https://example.test/', runScripts: 'outside-only'});
  t.after(() => dom.window.close());
  dom.window.eval(fs.readFileSync('assets/study-store.js', 'utf8'));
  return {w: dom.window, store: new dom.window.StudyStore()};
}

test('answers and marks are kept in this browser only', async t => {
  const {w, store} = setup(t);
  await store.checkSession();
  const event = {question_id: 'q1', request_id: '11111111-1111-4111-8111-111111111111', action: 'attempt', selected: 1, correct: false, elapsed_seconds: 30};
  const row = await store.questionEvent('section.html', '第一题', event);
  assert.equal(row.selected, 1);
  assert.equal(row.wrong_count, 1);
  assert.equal(row.elapsed_seconds, 30);
  const saved = JSON.parse(w.localStorage.getItem('tmu-study-records'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].question_id, 'q1');
  assert.equal(saved[0].page_path, 'section.html');
  await store.questionEvent('section.html', '第一题', {...event, request_id: '21111111-1111-4111-8111-111111111111', action: 'mark', marked: true});
  const [marked] = await store.list('study_records');
  assert.equal(marked.marked, true);
  assert.equal(marked.wrong_count, 1);
});

test('a replayed submission does not double count the attempt', async t => {
  const {store} = setup(t);
  await store.checkSession();
  const event = {question_id: 'q1', request_id: '31111111-1111-4111-8111-111111111111', action: 'attempt', selected: 0, correct: true};
  await store.questionEvent('p.html', '题一', event);
  await store.questionEvent('p.html', '题一', event);
  const [row] = await store.list('study_records');
  assert.equal(row.correct_count, 1);
});

test('favorites are stored once per page and can be removed', async t => {
  const {store} = setup(t);
  await store.checkSession();
  await store.save('study_favorites', {page_path: 'a.html'}, {conflict: 'page_path'});
  await store.save('study_favorites', {page_path: 'a.html'}, {conflict: 'page_path'});
  const favorites = await store.list('study_favorites');
  assert.equal(favorites.length, 1);
  assert.equal(favorites[0].page_path, 'a.html');
  await store.remove('study_favorites', 'page_path', 'a.html');
  assert.equal((await store.list('study_favorites')).length, 0);
});

test('stale edits are rejected and clearing learning data keeps uploaded pages', async t => {
  const {store} = setup(t);
  await store.checkSession();
  const note = await store.save('study_records', {title: '笔记', note: '第一版'});
  assert.equal(await store.save('study_records', {note: '第二版'}, {id: note.id, version: 'stale'}), null);
  const updated = await store.save('study_records', {note: '第二版'}, {id: note.id, version: note.updated_at});
  assert.equal(updated.note, '第二版');
  await store.save('study_pages', {title: 'HTML', category: '测试', html: '<h1>x</h1>'});
  await store.clearLearningData();
  assert.equal((await store.list('study_records')).length, 0);
  assert.equal((await store.list('study_pages')).length, 1);
});

test('the store still works when browser storage is unavailable', async t => {
  const dom = new JSDOM('', {url: 'https://example.test/', runScripts: 'outside-only'});
  t.after(() => dom.window.close());
  Object.defineProperty(dom.window, 'localStorage', {get() { throw new Error('blocked'); }});
  dom.window.eval(fs.readFileSync('assets/study-store.js', 'utf8'));
  const store = new dom.window.StudyStore();
  await store.checkSession();
  const row = await store.questionEvent('p.html', '题一', {question_id: 'q1', request_id: '41111111-1111-4111-8111-111111111111', action: 'attempt', selected: 0, correct: true});
  assert.equal(row.correct_count, 1);
  assert.equal((await store.list('study_records')).length, 1);
});
