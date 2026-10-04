#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const files = process.argv.slice(2).filter((arg) => arg !== "--apply");
if (!files.length) {
  console.error("Usage: node scripts/apply_legacy_explanation_proposals.mjs [--apply] <proposal.json> [...]");
  process.exit(2);
}

const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const baseline = JSON.parse(execFileSync("git", ["show", "1c84aeb:data/word-pilot-questions.json"], {
  cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
}));
const legacyIds = new Set(baseline.map((row) => row.id));
const rows = read("data/word-pilot-questions.json");
const byId = new Map(rows.map((row) => [row.id, row]));
const rawRows = read("data/questions.json");
const rawById = new Map(rawRows.map((row) => [row.id, row]));
const proposals = files.flatMap((file) => {
  const data = read(file);
  return Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : [];
});
const seen = new Set();
const issues = [];

for (const proposal of proposals) {
  const label = proposal.id || "<missing id>";
  const live = byId.get(proposal.id);
  const source = rawById.get(proposal.source_id);
  const answer = proposal.explanation?.match(/(?:the\s+)?correct answer is\s*[:.]?\s*([A-G])\b/i)?.[1]?.toUpperCase();
  const sourceAnswer = String(source?.answer || source?.correct_answer || "").match(/\b([A-G])\b/i)?.[1]?.toUpperCase();
  if (!proposal.id || seen.has(proposal.id)) issues.push(`${label}: duplicate/missing proposal ID`);
  seen.add(proposal.id);
  if (!legacyIds.has(proposal.id)) issues.push(`${label}: outside original 319-question scope`);
  if (!live) issues.push(`${label}: missing from current production data`);
  if (!source) issues.push(`${label}: missing raw OCR source ${proposal.source_id}`);
  if (!proposal.note?.trim() && !proposal.confidence) issues.push(`${label}: missing source-review note/confidence`);
  if (!proposal.explanation?.trim() || proposal.explanation.trim().length < 100) issues.push(`${label}: explanation missing/too short`);
  if (live && answer !== live.answer) issues.push(`${label}: explanation/live key mismatch (${answer || "unparsed"}/${live.answer})`);
  if (source && sourceAnswer && sourceAnswer !== live?.answer) issues.push(`${label}: raw OCR key conflicts with live key (${sourceAnswer}/${live?.answer})`);
  if (live && live.explanation === proposal.explanation) issues.push(`${label}: explanation already applied`);
}

if (issues.length) {
  console.error(issues.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  proposals: proposals.length,
  uniqueIds: seen.size,
  originalScope: baseline.length,
  currentTotal: rows.length,
  answerConflicts: 0,
}, null, 2));

if (apply) {
  for (const proposal of proposals) byId.get(proposal.id).explanation = proposal.explanation;
  fs.writeFileSync(path.join(root, "data/word-pilot-questions.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}
