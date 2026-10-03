import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const required = ["baseline", "system", "cross", "biostat"];
const missing = required.filter((key) => !args[key]);
if (missing.length) throw new Error(`Missing input arguments: ${missing.join(", ")}`);

const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const baselineInput = readJson(args.baseline);
const baseline = Array.isArray(baselineInput) ? baselineInput : baselineInput.questions;
const systemBatch = readJson(args.system).questions;
const crossBatch = readJson(args.cross);
const biostatBatch = readJson(args.biostat).questions;
if (![baseline, systemBatch, crossBatch, biostatBatch].every(Array.isArray)) {
  throw new Error("Each input must contain a question array");
}

const excludedDuplicateIds = new Set([
  "自建题库/KAPLAN QBANK/heme& lymph.pdf||27",
]);
const figureOverrides = new Map([
  ["自建题库/KAPLAN QBANK/PHARMACOLOGY/Pharma extra 13 questions.pdf||8", {
    images: ["assets/question-pages/pilot-pharma-q8-onychomycosis.jpg"],
    description: "局部趾甲增厚、变色及甲板粗糙，显示甲真菌病的典型外观。",
  }],
]);

function normalizeQuestion(question, batch, preserveId = false) {
  if (question.reviewed !== true || question.complete !== true || question.review_required === true) {
    throw new Error(`Refusing unreviewed/incomplete item: ${question.id}`);
  }
  const letters = question.options?.map((option) => option.letter);
  if (!question.chapter || !(question.fa_subchapter || question.subchapter || question.subcategory)
      || !question.stem?.trim() || !question.explanation?.trim() || !letters?.includes(question.answer)) {
    throw new Error(`Incomplete question content or taxonomy: ${question.id}`);
  }
  const rationales = question.choice_explanations || {};
  for (const letter of letters) {
    if (typeof rationales[letter] !== "string" || !rationales[letter].trim()) {
      throw new Error(`Missing explanation for ${question.id} choice ${letter}`);
    }
    const ref = question.option_fa?.[letter];
    if (!ref || ref.verified !== true || !(ref.text || ref.summary)
        || (ref.no_direct_match !== true && !Number.isInteger(ref.page) && !ref.pages?.length)) {
      throw new Error(`Unverified First Aid mapping for ${question.id} choice ${letter}`);
    }
    if (ref.no_direct_match === true && (ref.page != null || ref.pages?.length)) {
      throw new Error(`No-direct-match option has a misleading page: ${question.id} choice ${letter}`);
    }
  }

  const output = {
    id: preserveId ? question.id : `import-${crypto.createHash("sha256").update(`${batch}\n${question.id}`).digest("hex").slice(0, 24)}`,
    chapter: question.chapter,
    fa_subchapter: question.fa_subchapter || question.subchapter || question.subcategory,
    stem: question.stem.trim(),
    options: question.options.map(({ letter, text }) => ({ letter, text })),
    answer: question.answer,
    explanation: question.explanation.trim(),
    choice_explanations: Object.fromEntries(letters.map((letter) => [letter, rationales[letter].trim()])),
    option_fa: Object.fromEntries(letters.map((letter) => {
      const ref = question.option_fa[letter];
      const item = {
        verified: true,
        no_direct_match: ref.no_direct_match === true,
        text: ref.text || ref.summary,
      };
      if (ref.no_direct_match !== true) {
        if (Number.isInteger(ref.page)) item.page = ref.page;
        if (Array.isArray(ref.pages) && ref.pages.length) item.pages = ref.pages;
      }
      const images = ref.image_reviewed === true
        ? [...(ref.images || []), ...(ref.image ? [ref.image] : [])]
        : [];
      if (images.length) Object.assign(item, { image_reviewed: true, images: [...new Set(images)] });
      return [letter, item];
    })),
    reviewed: true,
    review_required: false,
    complete: true,
  };

  if (question.fa_page_verified === true) {
    const pages = Array.isArray(question.fa_pages) ? question.fa_pages.filter(Number.isInteger) : [];
    if (!pages.length && Number.isInteger(question.fa_page)) pages.push(question.fa_page);
    if (!pages.length) throw new Error(`Question-level FA page marked verified but missing: ${question.id}`);
    output.fa_pages = [...new Set(pages)];
    output.fa_page = Number.isInteger(question.fa_page) && output.fa_pages.includes(question.fa_page)
      ? question.fa_page
      : output.fa_pages[0];
    output.fa_page_verified = true;
    if (question.fa_summary?.trim()) output.fa_summary = question.fa_summary.trim();
  } else {
    output.fa_page_verified = false;
  }

  const figure = figureOverrides.get(question.id);
  const images = figure?.images || (question.question_figures_reviewed === true
    ? (question.question_images?.length ? question.question_images : question.question_image ? [question.question_image] : [])
    : []);
  if (images.length) {
    output.question_images = [...new Set(images)];
    output.question_figures_reviewed = true;
    output.question_figure_description = figure?.description || question.question_figure_description || "题目所需的局部图像。";
  }
  if (question.explanation_figures_reviewed === true && question.explanation_images?.length) {
    output.explanation_images = [...new Set(question.explanation_images)];
    output.explanation_figures_reviewed = true;
  }
  if (question.fa_figures_reviewed === true && question.fa_images?.length) {
    output.fa_images = [...new Set(question.fa_images)];
    output.fa_figures_reviewed = true;
  }

  for (const image of [
    ...(output.question_images || []),
    ...(output.explanation_images || []),
    ...(output.fa_images || []),
    ...Object.values(output.option_fa).flatMap((ref) => ref.images || []),
  ]) {
    const absolute = path.resolve(root, image);
    if (!absolute.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolute)) {
      throw new Error(`Missing or unsafe image asset ${image} on ${question.id}`);
    }
  }
  return output;
}

const baselineById = new Map(baseline.map((question) => [question.id, question]));
if (baselineById.size !== baseline.length) throw new Error("Baseline IDs are not unique");
const refreshedBaseline = baseline.map((question) => {
  const reviewed = baseline.find((candidate) => candidate.id === question.id);
  return normalizeQuestion(reviewed, "baseline", true);
});
const newQuestions = [];
const acceptedGroups = [
  ["system", systemBatch],
  ["cross", crossBatch],
  ["biostat", biostatBatch],
];
for (const key of Object.keys(args).filter((name) => name.startsWith("extra-")).sort()) {
  const input = readJson(args[key]);
  const candidates = Array.isArray(input) ? input : input.questions;
  if (!Array.isArray(candidates)) throw new Error(`Additional batch ${key} must contain a question array`);
  acceptedGroups.push([key.slice("extra-".length), candidates]);
}
for (const [batch, candidates] of acceptedGroups) {
  for (const question of candidates) {
    if (excludedDuplicateIds.has(question.id)) continue;
    if (question.reviewed !== true || question.complete !== true || question.review_required === true) continue;
    newQuestions.push(normalizeQuestion(question, batch));
  }
}

const merged = [...refreshedBaseline, ...newQuestions];
const ids = new Set();
const signatures = new Map();
for (const question of merged) {
  if (ids.has(question.id)) throw new Error(`Duplicate internal ID: ${question.id}`);
  ids.add(question.id);
  const signature = [question.stem, ...question.options.map((option) => option.text), question.answer]
    .join("|").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (signatures.has(signature)) throw new Error(`Exact duplicate: ${question.id} matches ${signatures.get(signature)}`);
  signatures.set(signature, question.id);
}

const target = path.join(root, "data/word-pilot-questions.json");
fs.writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ target, baseline: refreshedBaseline.length, added: newQuestions.length, total: merged.length, excludedDuplicateIds: [...excludedDuplicateIds] }, null, 2));
