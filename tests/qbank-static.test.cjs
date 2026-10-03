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
  assert.match(html,/\.num\.marked:after\{content:"标"/);
  assert.match(app,/record\.marked\?"已标记":"手动标记"/);
  assert.doesNotMatch(app,/星号为手动标记|[☆★]/);
});

test('retrying a failed cloud save reuses its request ID and a partial test-save retry skips completed items',()=>{
  assert.match(app,/function pendingAttempt\(q,selected\)/);
  assert.match(app,/job=\{request_id:crypto\.randomUUID\(\),selected\}/);
  assert.match(app,/request_id:job\.request_id,selected:selected\.charCodeAt\(0\)-65/);
  assert.match(app,/selected&&!answers\.has\(q\.cloud_id\)/);
  assert.match(app,/pendingAttempts\.clear\(\)/);
});

test('test length is editable and test mode can independently select one or more First Aid chapters',()=>{
  assert.match(html,/<input id="testCount" type="number"[^>]*min="1"/);
  for(const id of ['testChapterList','selectAllTestChapters','clearTestChapters','testChapterSummary']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(app,/Number\.isInteger\(requested\).*requested<1/);
  assert.match(app,/function testPool\(\)[\s\S]*selectedTestChapters\.has\(q\.chapter\)/);
  assert.match(app,/const pool=testPool\(\)/);
  assert.match(app,/filtered=\[\.\.\.pool\][\s\S]*slice\(0,requested\)/);
  assert.doesNotMatch(app,/const n=Math\.min\(requested,filtered\.length\)/);
  assert.match(app,/updateTestChapterSelection\(\)/);
  assert.match(html,/\.test-chapter-option input/);
  assert.match(html,/\.side\{color:#172b3d;background:transparent\}/);
});

test('test mode opens a dedicated setup flow with a named run and stopwatch/countdown controls',()=>{
  for(const id of ['testSetup','testName','testChapterList','testCount','testTimer','testDuration','testSessionBar','testClockDisplay']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/id="testTimer"[^>]*>[\s\S]*value="stopwatch"[\s\S]*value="countdown"/);
  assert.match(html,/id="questionHead"/);
  assert.match(app,/selectedTestChapters=new Set\(\)/);
  assert.match(app,/testName=\$\("testName"\)\.value\.trim\(\)/);
  assert.match(app,/testTimerMode===\"countdown\"/);
  assert.match(app,/testDurationSeconds-elapsed/);
  assert.match(app,/testTimerMode==="countdown"&&remaining<=0\)finishTest\(\)/);
  assert.match(app,/testTimerMode/);
  assert.match(app,/\$\("testSessionName"\)\.textContent=testName/);
});

test('practice retry controls distinguish the current question from restarting the filtered set',()=>{
  assert.match(html,/id="retryButton"[^>]*>重做当前题/);
  assert.match(html,/id="refresh"[^>]*>重开本组/);
  assert.match(html,/清除当前题本轮选项/);
  assert.match(html,/重新开始当前筛选题组/);
});

test('manual test submission requires confirmation and identifies unanswered questions',()=>{
  for(const id of ['finishConfirm','finishConfirmMessage','cancelFinish','confirmFinish']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/id="testSessionBar"[\s\S]*id="finish"/);
  assert.match(app,/function confirmFinishTest\(\)/);
  assert.match(app,/还有 \$\{unanswered\} 道题未作答/);
  assert.match(app,/\$\("finish"\)\.onclick=confirmFinishTest/);
  assert.match(app,/\$\("confirmFinish"\)\.onclick/);
});

test('standalone qbank does not save learning state in browser local storage or show source candidate panels',()=>{
  assert.doesNotMatch(app,/localStorage|sessionStorage/);
  assert.doesNotMatch(html,/First Aid 对应|题目资料说明|figureNotice|faRef/);
  assert.match(html,/assets\/cloud\.js/);
});

test('login accepts the test username and real-email accounts, with email registration requiring later authorization',()=>{
  for(const id of ['loginIdentifier','password','registerEmail'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/邮箱注册后需完成邮箱验证，并由管理员授权/);
  assert.match(app,/cloud\.login\(\$\("loginIdentifier"\)\.value/);
  assert.match(app,/cloud\.registerEmail\(identifier,password\)/);
  assert.match(fs.readFileSync('assets/cloud.js','utf8'),/INTERNAL_USERNAME_DOMAIN = 'users\.invalid'/);
});

test('direct QBank entry requires an authorized session before question data is loaded',()=>{
  assert.match(html,/<body class="auth-pending">/);
  assert.match(html,/body\.auth-pending \.shell,body\.auth-required \.shell\{visibility:hidden\}/);
  assert.match(app,/const authorized=await connectAccount\(\);[\s\S]*if\(!authorized\)[\s\S]*return;[\s\S]*await loadBank\(\)/);
});

test('manually verified OCR override corrects the anatomy item and points to printed FA page 463',()=>{
  const item=overrides['自建题库/KAPLAN QBANK/ANATOMY/anatomy extra.pdf||1'];
  assert.equal(item.options[1].text,'Adduction of the humerus at the shoulder');
  assert.equal(item.answer,'B');
  assert.equal(item.fa_page,463);
  assert.match(item.explanation,/infraspinatus and teres minor/);
  assert.match(app,/fetch\("\.\/data\/questions\.json"\)/);
  assert.doesNotMatch(app,/题目出处|PDF 题目页|source_pdf_pages/);
  assert.doesNotMatch(html,/题目出处|题目资料说明|First Aid 对应页码候选/);
  assert.match(app,/\$\("bankCount"\)\.textContent=`\$\{all\.length\} 道题可练习`/);
});

test('only manually reviewed questions enter the practice bank; unverified OCR is held back',()=>{
  assert.match(app,/q\.reviewed===true&&q\.review_required!==true&&q\.complete.*q\.stem.*q\.answer.*q\.options.*q\.explanation/);
  assert.equal(Object.keys(overrides).length,22);
  for(const q of Object.values(overrides)) assert.ok(q.chapter&&q.fa_subchapter&&q.stem&&q.options?.length&&q.answer&&q.explanation);
  for(const id of ['14','15','16','17','18','19']){
    const item=overrides[`自建题库/KAPLAN QBANK/ANATOMY/anatomy extra.pdf||${id}`];
    assert.equal(Object.keys(item.option_fa||{}).length,item.options.length);
    for(const option of item.options){
      const ref=item.option_fa[option.letter];
      assert.equal(ref?.verified,true);
      assert.ok(ref?.text);
      if(ref.no_direct_match) assert.equal(ref.page,undefined);
      else assert.ok(Number.isInteger(ref.page));
    }
  }
});

test('curated question text is free of common screenshot-OCR chrome and replacement characters',()=>{
  const forbidden=/\uFFFD|\b(?:Untimed|Previous\s+Next|Lab\s+Values\s+Notes\s+Text\s+Zoom|Explanation\s*&\s*ReKaps|Page\s+References|MedEssentials|USMLE\s+Qbank)\b|kaptest(?:\.com|com)|First\s+Aid\s+\(20(?:14|15|16)\)/i;
  for(const [id,q] of Object.entries(overrides)){
    const text=[q.stem,q.answer_text,q.explanation,...(q.options||[]).map(o=>o.text),...Object.values(q.choice_explanations||{})].join('\n');
    assert.doesNotMatch(text,forbidden,`${id} contains probable OCR/interface contamination`);
  }
});

test('First Aid references render for every option and can show page text and multiple images',()=>{
  assert.match(app,/const entries=optionsFor\(q\)\.map\(option=>\[option,refs\[option\.letter\]\]\)/);
  assert.match(app,/const verified=ref\?\.verified===true/);
  assert.match(app,/Array\.isArray\(ref\?\.pages\)/);
  assert.match(app,/Array\.isArray\(q\.fa_pages\)/);
  assert.match(app,/const copy=verified\?\(ref\.text\|\|ref\.summary\):null/);
  assert.match(app,/const images=verified&&ref\.image_reviewed===true\?\[\.\.\.\(ref\.images\|\|\[\]\),\.\.\.\(ref\.image\?\[ref\.image\]:\[\]\)\]:\[\]/);
  assert.match(app,/暂无经过人工核实的 First Aid 对应知识点/);
  assert.match(app,/q\.fa_page_verified===true/);
  assert.match(app,/FA 无直接条目/);
  assert.match(app,/查看 First Aid 页面图/);
});

test('first three visually audited musculoskeletal items have clean choices, rationale, and printed First Aid page matches',()=>{
  const base='自建题库/KAPLAN QBANK/ANATOMY/MUSCLOSKELETAL/muscloskeletal.pdf||';
  const expected=[['1','D',457],['2','E',450],['3','E',452]];
  for(const [number,answer,page] of expected){
    const item=overrides[base+number];
    assert.ok(item?.complete&&item.stem&&item.explanation);
    assert.equal(item.answer,answer);assert.equal(item.fa_page,page);
    assert.equal(Object.keys(item.option_fa||{}).length,item.options.length);
    for(const option of item.options)assert.ok(item.option_fa[option.letter]?.text||item.option_fa[option.letter]?.summary||item.option_fa[option.letter]?.no_direct_match);
    assert.doesNotMatch(item.stem,/most ikely|\bk decreased|\| and Il/i);
  }
});

test('first three musculoskeletal questions have verified per-option First Aid references',()=>{
  for(const id of ['1','2','3']){
    const key=`自建题库/KAPLAN QBANK/ANATOMY/MUSCLOSKELETAL/muscloskeletal.pdf||${id}`;
    const q=overrides[key];
    assert.equal(q.fa_reviewed,true);
    for(const option of q.options){
      const ref=q.option_fa?.[option.letter];
      assert.equal(ref?.verified,true,`${id}-${option.letter} is unverified`);
      assert.ok(ref.text?.length>20||ref.no_direct_match,`${id}-${option.letter} needs a content note`);
      for(const image of ref.images||[]) assert.match(image,/^assets\/(?:fa-pages|fa-figures)\/[a-z0-9-]+\.(?:png|jpg)$/i);
    }
  }
});

test('test results include source images and per-choice explanations',()=>{
  assert.match(app,/appendQuestionImages\(row,q\)/);
  assert.match(app,/appendExplanationImages\(row,filtered\[i\]\)/);
  assert.match(app,/查看原解析中的图表/);
  assert.match(app,/question_figures_reviewed!==true\)return/);
  assert.match(app,/explanation_figures_reviewed!==true\)return/);
  assert.match(app,/查看相关图表/);
  assert.doesNotMatch(app,/查看原始题面图像/);
  assert.match(app,/const notes=q\.choice_explanations/);
  assert.match(app,/notes\[letter\]/);
  assert.match(app,/test-option-result/);
  assert.match(app,/你的选择 · 错误/);
  assert.match(app,/正确答案/);
  for(const [number,file] of [['11','anatomy-extra-q11-spect.jpg'],['12','anatomy-extra-q12-pupil-table.jpg'],['16','anatomy-extra-q16-angiogram.jpg']]){
    const item=overrides[`自建题库/KAPLAN QBANK/ANATOMY/anatomy extra.pdf||${number}`];
    assert.equal(item.question_figures_reviewed,true);
    assert.deepEqual(item.question_images,[`assets/question-figures/${file}`]);
    if(number==='16') assert.ok(fs.existsSync(`assets/question-figures/${file}`));
  }
});

test('raw OCR is never used as a fallback explanation and account timing is migrated',()=>{
  assert.match(app,/暂不显示 OCR 原文/);
  assert.match(app,/attemptSeconds\.get\(q\.cloud_id\)\|\|0/);
  const migration=fs.readFileSync('supabase/migrations/004_question_elapsed_time.sql','utf8');
  assert.match(migration,/add column elapsed_seconds/);
  assert.match(migration,/create function public\.study_question_event/);
  assert.match(migration,/elapsed_seconds=elapsed_seconds \+ p_elapsed_seconds/);
});
