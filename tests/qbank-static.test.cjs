const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('qbank-v2.html','utf8');
const app=fs.readFileSync('assets/qbank-app.js','utf8');
const overrides=JSON.parse(fs.readFileSync('data/question-overrides.json','utf8'));

test('standalone qbank has separate marker/wrong filters, per-question retry and question navigation',()=>{
  for(const id of ['navigator','markedFilter','wrongFilter','retryButton','attempts','wrongAttempts','loginButton']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(app,/filterMode==="wrong"&&r\.wrong_count>0/);
  assert.match(app,/filterMode==="marked"&&r\.marked/);
  assert.match(app,/questionEvent\(pagePath,q\.chapter/);
});

test('standalone qbank does not save learning state in browser local storage or show source candidate panels',()=>{
  assert.doesNotMatch(app,/localStorage|sessionStorage/);
  assert.doesNotMatch(html,/First Aid 对应|题目资料说明|figureNotice|faRef/);
  assert.match(html,/assets\/cloud\.js/);
});

test('manually verified OCR override corrects the anatomy item and points to printed FA page 463',()=>{
  const item=overrides['自建题库/KAPLAN QBANK/ANATOMY/anatomy extra.pdf||1'];
  assert.equal(item.options[1].text,'Adduction of the humerus at the shoulder');
  assert.equal(item.answer,'B');
  assert.equal(item.fa_page,463);
  assert.match(item.explanation,/infraspinatus and teres minor/);
  assert.match(app,/question-overrides\.json/);
});

test('only manually reviewed questions enter the practice bank; unverified OCR is held back',()=>{
  assert.match(app,/const reviewed=new Set\(Object\.keys\(overrides\)\)/);
  assert.match(app,/reviewed\.has\(q\.id\).*q\.stem.*q\.answer.*q\.options.*q\.explanation/);
  assert.match(app,/未核验题暂不开放/);
  assert.equal(Object.keys(overrides).length,19);
  for(const q of Object.values(overrides)) assert.ok(q.chapter&&q.fa_subchapter&&q.stem&&q.options?.length&&q.answer&&q.explanation);
  for(const id of ['14','15','16','17','18','19']){
    const item=overrides[`自建题库/KAPLAN QBANK/ANATOMY/anatomy extra.pdf||${id}`];
    assert.equal(Object.keys(item.option_fa||{}).length,item.options.length);
    for(const option of item.options) assert.ok(item.option_fa[option.letter]?.page&&item.option_fa[option.letter]?.summary);
  }
});

test('test results include source images and per-choice explanations',()=>{
  assert.match(app,/appendQuestionImages\(row,q\)/);
  assert.match(app,/const notes=q\.choice_explanations/);
  assert.match(app,/notes\[letter\]/);
});

test('raw OCR is never used as a fallback explanation and account timing is migrated',()=>{
  assert.match(app,/暂不显示 OCR 原文/);
  assert.match(app,/attemptSeconds\.get\(q\.cloud_id\)\|\|0/);
  const migration=fs.readFileSync('supabase/migrations/004_question_elapsed_time.sql','utf8');
  assert.match(migration,/add column elapsed_seconds/);
  assert.match(migration,/create function public\.study_question_event/);
  assert.match(migration,/elapsed_seconds=elapsed_seconds \+ p_elapsed_seconds/);
});
