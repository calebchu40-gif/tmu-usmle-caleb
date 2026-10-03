const $ = id => document.getElementById(id);
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const pagePath = "qbank.html";
const localPreview = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).get("preview") === "1";
let cloud = null, user = null, all = [], filtered = [], current = 0, mode = "practice";
let records = new Map(), answers = new Map(), picks = new Map(), seconds = new Map(), attemptSeconds = new Map(), pendingAttempts = new Map();
let filterMode = "all", testDone = false, testStartedAt = 0, questionStartedAt = 0, timerHandle = null;
let testTimerMode = "stopwatch", testDurationSeconds = 0, testName = "";
let selectedTestChapters = new Set();

const fmt = value => {
  const s = Math.max(0, Math.floor(value || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const currentQuestion = () => filtered[current];
const activeRecord = q => records.get(q?.cloud_id) || {marked:false,submitted:false,correct_count:0,wrong_count:0,selected:null,correct:null};
async function cloudId(q) {
  if(q.cloud_id)return q.cloud_id;
  const raw = String(q.id || "");
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `qb-${[...new Uint8Array(digest)].slice(0,20).map(n=>n.toString(16).padStart(2,"0")).join("")}`;
}
function status(message, isError=false) { $("saveState").textContent=message; $("saveState").style.color=isError?"#b44742":""; }
function selectedChapter() { return $("chapter").value; }
function fillHierarchy() {
  const chapters=[...new Set(all.map(q=>q.chapter).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"en"));
  const old=$("chapter").value; $("chapter").replaceChildren(new Option("全部章节",""));
  chapters.forEach(x=>$("chapter").add(new Option(x,x))); $("chapter").value=chapters.includes(old)?old:"";
  const rows=all.filter(q=>!selectedChapter()||q.chapter===selectedChapter());
  const subs=[...new Set(rows.map(q=>q.fa_subchapter).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"en"));
  const list=$("subList"); list.replaceChildren();
  const add=(name,value,count)=>{const b=document.createElement("button");b.className="cat"+(window.subFilter===value?" active":"");b.textContent=name;const n=document.createElement("span");n.textContent=count;b.append(n);b.onclick=()=>{window.subFilter=value;applyFilter()};list.append(b)};
  add("全部小节","",rows.length);subs.forEach(s=>add(s,s,rows.filter(q=>q.fa_subchapter===s).length));
}
function testPool() {
  return all.filter(q=>selectedTestChapters.has(q.chapter));
}
function updateTestChapterSelection() {
  const box=$("testChapterList");
  if(!box)return;
  const chapters=[...new Set(all.map(q=>q.chapter).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"en"));
  box.replaceChildren();
  for(const chapter of chapters){
    const label=document.createElement("label");label.className="test-chapter-option";
    const input=document.createElement("input");input.type="checkbox";input.value=chapter;input.checked=selectedTestChapters.has(chapter);input.addEventListener("change",()=>{input.checked?selectedTestChapters.add(chapter):selectedTestChapters.delete(chapter);updateTestChapterSummary()});
    const name=document.createElement("span");name.textContent=chapter;
    const count=document.createElement("small");count.textContent=String(all.filter(q=>q.chapter===chapter).length);
    label.append(input,name,count);box.append(label);
  }
  updateTestChapterSummary();
}
function updateTestChapterSummary() {
  const count=testPool().length, selected=selectedTestChapters.size;
  const summary=$("testChapterSummary");
  if(summary)summary.textContent=selected?`已选 ${selected} 个章节，共 ${count} 道可测试题。测试题量不能超过可用题数。`:`尚未选择章节；请选择至少一个章节。`;
  const input=$("testCount");if(input){input.max=String(Math.max(1,count));input.setCustomValidity(count&&Number(input.value)>count?`所选章节只有 ${count} 道题。`:``)}
  const button=$("startTest");if(button)button.disabled=count===0;
}
function applyFilter() {
  const chapter=selectedChapter(),sub=window.subFilter||"",term=$("search").value.trim().toLowerCase();
  filtered=all.filter(q=>{
    const r=activeRecord(q), text=`${q.stem||""} ${q.chapter||""} ${q.fa_subchapter||""}`.toLowerCase();
    return (!chapter||q.chapter===chapter)&&(!sub||q.fa_subchapter===sub)&&(!term||text.includes(term))&&
      (filterMode==="all"||(filterMode==="marked"&&r.marked)||(filterMode==="wrong"&&r.wrong_count>0));
  });
  current=Math.min(current,Math.max(0,filtered.length-1));
  $("crumb").textContent=[chapter,sub].filter(Boolean).join(" / ")||"全部章节";
  $("markedFilter").classList.toggle("active",filterMode==="marked");$("wrongFilter").classList.toggle("active",filterMode==="wrong");
  fillHierarchy(); render();
}
function optionsFor(q) {
  if(q.options?.length) return q.options;
  const n=q.answer==="F"?6:5;
  return alphabet.slice(0,n).split("").map(letter=>({letter,text:`请查看题面图片中的 ${letter} 选项`}));
}
function stopClock() {
  if(timerHandle){clearInterval(timerHandle);timerHandle=null;}
  if(questionStartedAt&&currentQuestion()){
    const id=currentQuestion().cloud_id, elapsed=(performance.now()-questionStartedAt)/1000;
    seconds.set(id,(seconds.get(id)||0)+elapsed);
    attemptSeconds.set(id,(attemptSeconds.get(id)||0)+elapsed);
  }
  questionStartedAt=0;
}
function startClock() {
  stopClock();
  const enabled=(mode==="test"&&testStartedAt>0)||($("timerToggle").checked&&!answers.has(currentQuestion()?.cloud_id));
  if(!enabled||testDone)return;
  questionStartedAt=performance.now(); timerHandle=setInterval(()=>{
    const q=currentQuestion();if(!q)return;
    const base=mode==="test"?(attemptSeconds.get(q.cloud_id)||0):(seconds.get(q.cloud_id)||0);
    $("timer").textContent=fmt(base+(performance.now()-questionStartedAt)/1000);
    if(mode==="test"){
      const elapsed=(performance.now()-testStartedAt)/1000;
      const remaining=Math.max(0,testDurationSeconds-elapsed);
      $("testClockDisplay").textContent=fmt(testTimerMode==="countdown"?remaining:elapsed);
      if(testTimerMode==="countdown"&&remaining<=0)finishTest();
    }
  },500);
}
function renderImages(q) {
  const box=$("images");box.replaceChildren();appendQuestionImages(box,q);
}
function appendQuestionImages(box,q) {
  if(q.question_figures_reviewed!==true)return;
  const srcs=q.question_images?.length?q.question_images:(q.question_image?[q.question_image]:[]);
  if(!srcs.length)return;
  const d=document.createElement("details"),s=document.createElement("summary");s.textContent=`查看相关图表（${srcs.length}）`;d.append(s);
  srcs.forEach(src=>{const img=document.createElement("img");img.src=`./${src}`;img.alt=q.question_figure_description||"题目相关图表";img.loading="lazy";d.append(img)});box.append(d);
}
function appendExplanationImages(box,q) {
  if(q.explanation_figures_reviewed!==true)return;
  const srcs=q.explanation_images||[];
  if(!srcs.length)return;
  const d=document.createElement("details"),s=document.createElement("summary");d.className="explanation-images";s.textContent=`查看原解析中的图表（${srcs.length} 页）`;d.append(s);
  srcs.forEach(src=>{const img=document.createElement("img");img.src=`./${src}`;img.alt="题目原解析中的图表或表格";img.loading="lazy";d.append(img)});box.append(d);
}
function cleanExplanation(q) {
  const raw=q.explanation||q.answer_text||"源文件未提取到解析。";
  const begin=raw.search(/the correct answer is\s+[A-F]/i);
  let text=begin>=0?raw.slice(begin):raw;
  text=text.split(/\n\s*(?:J\s+I\s+USE|J\s+IK\s+USMLE|€\s*\(©|Untimed\b|End of Playback\b|Updated on\b|\|\s*Page References\s*\|)/i)[0];
  text=text.replace(/Explanation\s*&\s*ReKaps\s*=?/gi,"").replace(/\bReKaps\b/gi,"");
  text=text.split(/\n/).filter(line=>!/^\s*(?:[=+|<>/•-]*\s*)?\d{1,3}\s*$/.test(line)&&!/^\s*(?:Lab Values|Notes|Text Zoom|Previous|Next)\s*$/i.test(line)).join("\n");
  return text.replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim()||"解析文字尚未通过人工校对，暂不显示 OCR 原文。";
}
function appendOptionFa(container,q) {
  const refs=q.option_fa||{};
  const entries=optionsFor(q).map(option=>[option,refs[option.letter]]);
  if(!entries.length)return;
  const section=document.createElement("section");section.className="fa-reference-list";
  const heading=document.createElement("h4");heading.textContent="First Aid 对应知识点";section.append(heading);
  for(const [option,ref] of entries){
    const item=document.createElement("div");item.className="fa-reference";
    const verified=ref?.verified===true;
    const title=document.createElement("strong");title.textContent=`选项 ${option.letter}${verified&&ref.no_direct_match?" · FA 无直接条目":verified&&ref.page?` · 印刷页 ${ref.page}`:" · 待核实"}`;item.append(title);
    const copy=verified?(ref.text||ref.summary):null;
    const text=document.createElement("p");text.textContent=copy||"暂无经过人工核实的 First Aid 对应知识点。";item.append(text);
    const images=verified&&ref.image_reviewed===true?[...(ref.images||[]),...(ref.image?[ref.image]:[])]:[];
    if(images.length){const details=document.createElement("details"),summary=document.createElement("summary");summary.textContent=`查看 First Aid 页面图（${images.length} 页）`;details.append(summary);for(const src of images){const image=document.createElement("img");image.src=`./${src}`;image.alt=`First Aid 选项 ${option.letter} 配图`;image.loading="lazy";details.append(image)}item.append(details)}
    section.append(item);
  }
  container.append(section);
}
function renderExplanation(q, answer) {
  const box=$("explanation");box.replaceChildren();
  const right=answer===q.answer, line=document.createElement("b");line.style.color=right?"#16845b":"#b44742";line.textContent=`${right?"回答正确":"回答错误"} · 正确答案 ${q.answer||"未识别"}`;box.append(line);
  const explanation=document.createElement("p");explanation.textContent=cleanExplanation(q);box.append(explanation);
  const choiceNotes=q.choice_explanations||q.distractor_explanations;
  if(choiceNotes){for(const opt of optionsFor(q)){const note=choiceNotes[opt.letter]||choiceNotes[opt.letter.toLowerCase()];if(note){const p=document.createElement("p");p.textContent=`${opt.letter}. ${note}`;box.append(p)}}}
  appendExplanationImages(box,q);
  appendOptionFa(box,q);
  const summary=q.fa_summary||q.textbook_summary;
  if(summary&&q.fa_page&&q.fa_page_verified===true){const ref=document.createElement("div");ref.className="textbook";ref.textContent=`First Aid 知识点：${summary}（印刷页码 ${q.fa_page}）`;box.append(ref)}
  else if(q.fa_pages?.length||q.fa_page){const ref=document.createElement("div");ref.className="textbook";ref.textContent="First Aid 知识点与印刷页码正在逐题校核；未核实前不显示候选页码。";box.append(ref)}
}
function renderNavigator() {
  const nav=$("navigator");nav.replaceChildren();
  filtered.forEach((q,i)=>{const b=document.createElement("button"),r=activeRecord(q),done=answers.get(q.cloud_id);b.className="num"+(i===current?" current":"")+(r.marked?" marked":"")+((done&&!done.correct)||(!done&&r.submitted&&!r.correct)?" wrong":"");b.textContent=String(i+1);b.title=`第 ${i+1} 题${r.marked?" · 已标记":""}${r.wrong_count?` · 错 ${r.wrong_count} 次`:""}`;b.onclick=()=>{stopClock();current=i;render()};nav.append(b)});
  $("navigatorNote").textContent=`共 ${filtered.length} 题；“标”为手动标记，红框为错题。`;
}
function render() {
  const q=currentQuestion();
  if(!q){$("title").textContent="当前筛选没有题目";$("stem").textContent="切换 First Aid 章节/小节，或清除标记、错题筛选。";$("choices").replaceChildren();$("index").textContent="0";$("total").textContent="/ 0";renderNavigator();return}
  const record=activeRecord(q),done=answers.get(q.cloud_id),picked=picks.get(q.cloud_id);
  $("title").textContent=`${q.chapter||"未分类"} · ${q.fa_subchapter||"小节待核对"}`;$("subtitle").textContent=mode==="test"?(testDone?"测试已完成；查看逐题答案与解析。":"交卷前不显示答案与解析。"):"提交后查看题目解析；重新作答不会清除历史统计。";
  $("chapterTag").textContent=q.chapter||"章节待核对";$("subTag").textContent=q.fa_subchapter||"小节待核对";$("stem").textContent=q.stem||"题干未提取，暂不可作答。";
  $("index").textContent=String(current+1).padStart(2,"0");$("total").textContent=`/ ${filtered.length}`;$("timer").textContent=fmt(seconds.get(q.cloud_id)||0);
  const choices=$("choices");choices.replaceChildren();
  for(const [i,opt] of optionsFor(q).entries()){
    const letter=opt.letter||alphabet[i],b=document.createElement("button");b.className="choice";if(picked===letter)b.classList.add("selected");
    if(done&&mode==="practice"){if(letter===q.answer)b.classList.add("correct");else if(letter===done.selected)b.classList.add("wrong");b.disabled=true}
    if(testDone){if(letter===q.answer)b.classList.add("correct");else if(letter===picked)b.classList.add("wrong");b.disabled=true}
    const l=document.createElement("span"),t=document.createElement("span");l.className="letter";l.textContent=letter;t.textContent=opt.text||"";b.append(l,t);
    b.onclick=()=>{if(done||testDone)return;picks.set(q.cloud_id,letter);render()};choices.append(b);
  }
  renderImages(q);
  $("markButton").textContent=record.marked?"已标记":"手动标记";
  $("prev").disabled=current<=0;$("next").disabled=current>=filtered.length-1;
  $("submit").classList.toggle("hidden",mode==="test");$("finish").classList.toggle("hidden",mode!=="test"||testDone);
  $("hint").textContent=mode==="test"?(testDone?"测试结果已生成。":"选择答案后继续，交卷前不显示答案。"):(done?"本次已提交；可点‘重新作答’再次练习。":"选择答案后提交，即时查看解析。");
  const explanation=$("explanation");explanation.classList.toggle("visible",mode==="practice"&&Boolean(done)||mode==="test"&&testDone);if(explanation.classList.contains("visible"))renderExplanation(q,done?.selected||picked);
  const totalAttempts=record.correct_count+record.wrong_count;$("attempts").textContent=totalAttempts;$("wrongAttempts").textContent=record.wrong_count;
  const complete=filtered.filter(x=>activeRecord(x).submitted||answers.has(x.cloud_id)).length;const correct=filtered.reduce((n,x)=>n+activeRecord(x).correct_count,0);const attempts=filtered.reduce((n,x)=>n+activeRecord(x).correct_count+activeRecord(x).wrong_count,0);$("progress").textContent=`${complete} / ${filtered.length}`;$("accuracy").textContent=`${attempts?Math.round(correct/attempts*100):0}%`;
  $("totalTime").textContent=`本题累计计时 ${fmt(seconds.get(q.cloud_id)||0)}；进度保存到登录账号。`;
  renderNavigator();startClock();
}
async function refreshRecords() {
  const rows=await cloud.list("study_records","*");records=new Map(rows.filter(r=>r.page_path===pagePath&&r.question_id).map(r=>[r.question_id,r]));
  seconds=new Map(rows.filter(r=>r.page_path===pagePath&&r.question_id).map(r=>[r.question_id,Number(r.elapsed_seconds)||0]));
  status(`已同步 ${rows.filter(r=>r.page_path===pagePath).length} 道题记录`);render();
}
async function connectAccount() {
  if(localPreview){$("accountLabel").textContent="本地样本预览 · 不同步记录";$("loginButton").classList.add("hidden");status("本地预览模式；答案与测试结果仅用于检查页面。请勿将此模式部署到公开站点。",false);return;}
  try{
    cloud=await window.connectStudyCloud();if(!cloud)throw new Error("云端配置缺失。");
    user=await cloud.checkSession();
    if(user){$("accountLabel").textContent=cloud.displayName(user)||"已登录";$("loginButton").classList.add("hidden");$("logoutButton").classList.remove("hidden");await refreshRecords();status("答题记录已从账号同步");}
    else{$("accountLabel").textContent="未登录 · 记录不会同步";status("请登录后答题，才能保存到账号。");}
  }catch(e){status(e.message||"账号连接失败",true);$("accountLabel").textContent="账号连接失败";}
}
async function saveEvent(q,action,payload={}) {
  if(!user||!cloud)throw new Error("请先登录账号，答题记录才能云端保存。");
  const result=await cloud.questionEvent(pagePath,q.chapter||"Step 1 题库",{question_id:q.cloud_id,request_id:crypto.randomUUID(),action,...payload});
  records.set(q.cloud_id,result);return result;
}
function pendingAttempt(q,selected) {
  let job=pendingAttempts.get(q.cloud_id);
  if(!job||job.selected!==selected){job={request_id:crypto.randomUUID(),selected};pendingAttempts.set(q.cloud_id,job)}
  return job;
}
async function submitAnswer(q,selected) {
  if(!user&&!localPreview){$("loginModal").classList.remove("hidden");$("loginStatus").textContent="请登录后保存本次作答。";return false;}
  const correct=selected===q.answer;stopClock();
  if(localPreview){const prior=activeRecord(q);records.set(q.cloud_id,{...prior,submitted:true,correct_count:prior.correct_count+(correct?1:0),wrong_count:prior.wrong_count+(correct?0:1)});answers.set(q.cloud_id,{selected,correct});attemptSeconds.set(q.cloud_id,0);status("本地预览：作答结果未保存到账号");render();return true;}
  status("正在保存答题记录…");
  const job=pendingAttempt(q,selected);
  try{const rec=await saveEvent(q,"attempt",{request_id:job.request_id,selected:selected.charCodeAt(0)-65,correct,elapsed_seconds:attemptSeconds.get(q.cloud_id)||0});if(pendingAttempts.get(q.cloud_id)?.request_id===job.request_id)pendingAttempts.delete(q.cloud_id);answers.set(q.cloud_id,{selected,correct});attemptSeconds.set(q.cloud_id,0);if(rec?.elapsed_seconds!=null)seconds.set(q.cloud_id,Number(rec.elapsed_seconds));status(rec?.time_sync_pending?"作答次数已同步；计时云同步等待数据库迁移":"已同步到账号");render();return true;}
  catch(e){status(`云端保存失败：${e.message||"请重试"}`,true);return false;}
}
async function toggleMark() {
  const q=currentQuestion();if(!q)return;if(!user&&!localPreview){$("loginModal").classList.remove("hidden");$("loginStatus").textContent="请登录后同步手动标记。";return;}
  if(localPreview){records.set(q.cloud_id,{...activeRecord(q),marked:!activeRecord(q).marked});status("本地预览：手动标记未保存到账号");render();return;}
  const next=!activeRecord(q).marked;try{await saveEvent(q,"mark",{marked:next});status("手动标记已同步");render()}catch(e){status(`标记保存失败：${e.message}`,true)}
}
function fillTestResults() {
  const correct=filtered.filter(q=>picks.get(q.cloud_id)===q.answer).length,total=filtered.length,elapsed=(performance.now()-testStartedAt)/1000;
  const box=$("testResults");box.classList.remove("hidden");box.replaceChildren();
  const h=document.createElement("h2");h.textContent=`${testName||"未命名测试"} · 测试结果`;box.append(h);
  const p=document.createElement("p");p.textContent=`正确 ${correct}/${total} · 正确率 ${total?Math.round(correct/total*100):0}% · 总用时 ${fmt(elapsed)}`;box.append(p);
  filtered.forEach((q,i)=>{
    const row=document.createElement("details");row.className="notice";const summary=document.createElement("summary"),pick=picks.get(q.cloud_id);
    summary.textContent=`${i+1}. ${pick===q.answer?"正确":"错误/未答"} · 你的答案 ${pick||"—"} · 正确答案 ${q.answer||"未识别"} · 本次用时 ${fmt(attemptSeconds.get(q.cloud_id)||0)} · ${q.chapter} / ${q.fa_subchapter}`;row.append(summary);
    const stem=document.createElement("p");stem.textContent=q.stem||"";row.append(stem);appendQuestionImages(row,q);
    const notes=q.choice_explanations||q.distractor_explanations||{},choices=document.createElement("div");choices.className="test-result-choices";
    for(const option of optionsFor(q)){
      const letter=option.letter,line=document.createElement("div"),label=document.createElement("span"),copy=document.createElement("span"),result=document.createElement("span");
      line.className="test-option-result"+(letter===q.answer?" correct":"")+(letter===pick&&pick!==q.answer?" incorrect":"");
      label.className="letter";label.textContent=letter;copy.className="option-result-copy";copy.textContent=`${option.text}${notes[letter]?` — ${notes[letter]}`:""}`;
      result.className="option-result-status";result.textContent=letter===pick&&letter===q.answer?"你的选择 · 正确答案":letter===pick?"你的选择 · 错误":letter===q.answer?"正确答案":"";
      line.append(label,copy,result);choices.append(line);
    }
    row.append(choices);const expl=document.createElement("p");expl.textContent=cleanExplanation(q);row.append(expl);appendOptionFa(row,q);
    const summaryText=q.fa_summary||q.textbook_summary;if(summaryText){const note=document.createElement("div");note.className="textbook";note.textContent=`First Aid 知识点：${summaryText}${q.fa_page_verified===true&&q.fa_page?`（印刷页码 ${q.fa_page}）`:""}`;row.append(note)}box.append(row);
  });
  [...box.querySelectorAll("details.notice")].forEach((row,i)=>appendExplanationImages(row,filtered[i]));
}
function confirmFinishTest() {
  const unanswered=filtered.filter(q=>!picks.has(q.cloud_id)).length;
  $("finishConfirmMessage").textContent=unanswered?`还有 ${unanswered} 道题未作答。确认现在交卷吗？交卷后将显示答案与解析。`:`本次 ${filtered.length} 道题均已作答。确认交卷并查看结果吗？`;
  $("finishConfirm").classList.remove("hidden");$("confirmFinish").focus();
}
async function finishTest() {
  if(testDone)return;$("finishConfirm").classList.add("hidden");stopClock();testDone=true;
  if(!user&&!localPreview){testDone=false;$("loginModal").classList.remove("hidden");$("loginStatus").textContent="登录后才能提交并保存这次测试。";return;}
  if(localPreview){status("本地预览：测试结果未保存到账号");fillTestResults();render();return;}
  status("正在保存测试结果…");
  for(const q of filtered){const selected=picks.get(q.cloud_id);if(selected&&!answers.has(q.cloud_id)){const job=pendingAttempt(q,selected);try{const rec=await saveEvent(q,"attempt",{request_id:job.request_id,selected:selected.charCodeAt(0)-65,correct:selected===q.answer,elapsed_seconds:attemptSeconds.get(q.cloud_id)||0});if(pendingAttempts.get(q.cloud_id)?.request_id===job.request_id)pendingAttempts.delete(q.cloud_id);answers.set(q.cloud_id,{selected,correct:selected===q.answer});if(rec?.elapsed_seconds!=null)seconds.set(q.cloud_id,Number(rec.elapsed_seconds));}catch(e){testDone=false;status(`测试保存中断：${e.message}`,true);return}}}
  status("测试结果已同步");fillTestResults();render();
}
function startTest() {
  const pool=testPool();
  if(!pool.length){status("请至少选择一个有可用题目的 First Aid 章节。",true);return;}
  const requested=Number($("testCount").value);
  if(!Number.isInteger(requested)||requested<1){status("请输入大于 0 的整数题量。",true);$("testCount").focus();return;}
  if(requested>pool.length){status(`所选章节只有 ${pool.length} 道题，请减少题量或再选章节。`,true);$("testCount").focus();return;}
  testName=$("testName").value.trim()||"未命名测试";
  testTimerMode=$("testTimer").value;
  if(testTimerMode==="countdown"){
    const minutes=Number($("testDuration").value);
    if(!Number.isInteger(minutes)||minutes<1||minutes>600){status("倒计时请填写 1–600 的整数分钟。",true);$("testDuration").focus();return;}
    testDurationSeconds=minutes*60;
  }
  filtered=[...pool].sort(()=>Math.random()-.5).slice(0,requested);current=0;answers=new Map();picks=new Map();seconds=new Map();attemptSeconds=new Map();pendingAttempts.clear();testStartedAt=performance.now();testDone=false;mode="test";
  document.body.classList.remove("test-setup-active");document.body.classList.add("test-running");$("practiceFilters").classList.add("hidden");$("testSetup").classList.add("hidden");$("questionHead").classList.remove("hidden");$("quizLayout").classList.remove("hidden");$("testSessionBar").classList.remove("hidden");$("testSessionName").textContent=testName;$("testClockLabel").textContent=testTimerMode==="countdown"?"倒计时剩余":"正计时";$("testClockDisplay").textContent=fmt(testTimerMode==="countdown"?testDurationSeconds:0);$("modeLabel").textContent=`测试模式 · ${testName}`;$("testResults").classList.add("hidden");render();
}
function setMode(next) {
  stopClock();mode=next;testDone=false;testStartedAt=0;$("practiceMode").classList.toggle("active",next==="practice");$("testMode").classList.toggle("active",next==="test");$("practiceFilters").classList.toggle("hidden",next==="test");$("testSetup").classList.toggle("hidden",next!=="test");$("questionHead").classList.toggle("hidden",next==="test");$("quizLayout").classList.toggle("hidden",next==="test");$("testSessionBar").classList.add("hidden");document.body.classList.toggle("test-setup-active",next==="test");document.body.classList.remove("test-running");$("retryButton").classList.toggle("hidden",next==="test");$("timerToggle").closest("label").classList.toggle("hidden",next==="test");$("modeLabel").textContent=next==="practice"?"知识点练习 · 即时反馈":"测试模式 · 统一阅卷";$("testResults").classList.add("hidden");applyFilter();
}
function move(delta){stopClock();current=Math.max(0,Math.min(filtered.length-1,current+delta));render()}
async function init() {
  try{
    const response=await fetch("./data/questions.json");if(!response.ok)throw new Error("题库数据加载失败");all=await response.json();
    all=all.filter(q=>q.reviewed===true&&q.review_required!==true&&q.complete&&q.chapter&&q.stem&&q.answer&&Array.isArray(q.options)&&q.options.length>=2&&q.explanation);
    await Promise.all(all.map(async q=>{q.cloud_id=await cloudId(q)}));
    $("bankCount").textContent=`${all.length} 道题可练习`;
    selectedTestChapters=new Set();
    $("chapter").replaceChildren(new Option("全部章节",""),...[]);fillHierarchy();updateTestChapterSelection();applyFilter();await connectAccount();
  }catch(e){$("title").textContent="题库载入失败";$("subtitle").textContent=e.message;status(e.message,true)}
}
$("chapter").onchange=()=>{window.subFilter="";applyFilter()};$("search").oninput=applyFilter;
$("practiceMode").onclick=()=>setMode("practice");$("testMode").onclick=()=>setMode("test");
$("selectAllTestChapters").onclick=()=>{selectedTestChapters=new Set(all.map(q=>q.chapter).filter(Boolean));updateTestChapterSelection()};$("clearTestChapters").onclick=()=>{selectedTestChapters.clear();updateTestChapterSelection()};
$("testCount").oninput=updateTestChapterSummary;
$("testTimer").onchange=()=>$("testDurationRow").classList.toggle("hidden",$("testTimer").value!=="countdown");
$("prev").onclick=()=>move(-1);$("next").onclick=()=>move(1);$("submit").onclick=()=>{const q=currentQuestion(),p=q&&picks.get(q.cloud_id);if(q&&p)submitAnswer(q,p)};
$("markButton").onclick=toggleMark;$("retryButton").onclick=()=>{const q=currentQuestion();if(!q)return;answers.delete(q.cloud_id);picks.delete(q.cloud_id);attemptSeconds.set(q.cloud_id,0);render()};
$("markedFilter").onclick=()=>{filterMode=filterMode==="marked"?"all":"marked";applyFilter()};$("wrongFilter").onclick=()=>{filterMode=filterMode==="wrong"?"all":"wrong";applyFilter()};
$("refresh").onclick=()=>{stopClock();filterMode="all";answers.clear();picks.clear();attemptSeconds.clear();pendingAttempts.clear();testDone=false;$("testResults").classList.add("hidden");status("已重置本轮练习；账号历史统计保留");applyFilter()};
$("timerToggle").onchange=render;
$("finish").onclick=confirmFinishTest;
$("cancelFinish").onclick=()=>$("finishConfirm").classList.add("hidden");
$("confirmFinish").onclick=()=>{$("finishConfirm").classList.add("hidden");finishTest()};
$("finishConfirm").onclick=event=>{if(event.target===$("finishConfirm"))$("finishConfirm").classList.add("hidden")};
document.addEventListener("keydown",event=>{if(event.key==="Escape")$("finishConfirm").classList.add("hidden")});
$("startTest").onclick=startTest;
$("loginButton").onclick=()=>{$("loginModal").classList.remove("hidden");$("loginStatus").textContent=""};$("cancelLogin").onclick=()=>$("loginModal").classList.add("hidden");
$("logoutButton").onclick=async()=>{if(!cloud)return;await cloud.logout();user=null;records.clear();answers.clear();pendingAttempts.clear();$("loginButton").classList.remove("hidden");$("logoutButton").classList.add("hidden");$("accountLabel").textContent="未登录 · 记录不会同步";status("已退出账号");render()};
$("loginForm").onsubmit=async event=>{event.preventDefault();$("loginStatus").textContent="正在登录…";try{if(!cloud)cloud=await window.connectStudyCloud();user=await cloud.login($("loginIdentifier").value,$("password").value);$("password").value="";$("loginModal").classList.add("hidden");$("accountLabel").textContent=cloud.displayName(user)||"已登录";$("loginButton").classList.add("hidden");$("logoutButton").classList.remove("hidden");await refreshRecords();status("账号已登录，记录已同步");}catch(e){$("loginStatus").textContent=e.message||"登录失败"}};
$("registerEmail").onclick=async()=>{const identifier=$("loginIdentifier").value.trim();const password=$("password").value;$("loginStatus").textContent="正在创建邮箱账号…";try{if(!cloud)cloud=await window.connectStudyCloud();if(!identifier.includes("@"))throw new Error("邮箱注册请在账号框中填写邮箱地址。");const result=await cloud.registerEmail(identifier,password);$("password").value="";$("loginStatus").textContent=result.confirmationRequired?"注册请求已创建。请查收验证邮件；完成验证后还需管理员授权才能访问。":"注册已创建。请联系管理员将账号加入授权名单后再登录。";}catch(e){$("loginStatus").textContent=e.message||"邮箱注册失败"}};
init();
