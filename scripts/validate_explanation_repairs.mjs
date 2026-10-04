#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node scripts/validate_explanation_repairs.mjs <proposal.json> [...]");
  process.exit(2);
}

const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const baselineText = execFileSync("git", ["show", "1c84aeb:data/word-pilot-questions.json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
const legacyRows = JSON.parse(baselineText);
const legacyById = new Map(legacyRows.map((row) => [row.id, row]));
const liveRows = readJson("data/word-pilot-questions.json");
const liveById = new Map(liveRows.map((row) => [row.id, row]));
const rawRows = readJson("data/questions.json");
const rawById = new Map(rawRows.map((row) => [row.id, row]));
const seenIds = new Set();
const report = [];

function proposalsFor(file) {
  const parsed = readJson(file);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
  if (parsed && typeof parsed === "object") return Object.values(parsed);
  throw new Error(`Unsupported proposal shape: ${file}`);
}

for (const file of args) {
  for (const proposal of proposalsFor(file)) {
    const issues = [];
    const warnings = [];
    const live = liveById.get(proposal.id);
    const legacy = legacyById.get(proposal.id);
    const raw = rawById.get(proposal.source_id);
    const explanationKey = proposal.explanation?.match(/(?:the\s+)?correct answer is\s*[:.]?\s*([A-G])\b/i)?.[1]?.toUpperCase() || null;
    const rawKey = String(raw?.answer || raw?.correct_answer || "").match(/\b([A-G])\b/i)?.[1]?.toUpperCase() || null;

    if (!proposal.id || seenIds.has(proposal.id)) issues.push("duplicate proposal ID in this batch");
    seenIds.add(proposal.id);
    if (!legacy) issues.push("not part of the original 319-question repair scope");
    if (!live) issues.push("live question ID missing");
    if (!proposal.source_id) issues.push("source ID missing");
    else if (!raw) warnings.push("source ID is not in raw OCR JSON; human ledger must verify the Word/PDF source directly");
    if (!proposal.explanation?.trim() || proposal.explanation.trim().length < 100) issues.push("explanation missing/too short");
    if (live && explanationKey !== live.answer) issues.push(`explanation/live key mismatch (${explanationKey || "unparsed"}/${live.answer})`);

    report.push({
      proposal_file: file,
      id: proposal.id,
      source_id: proposal.source_id || null,
      live_answer: live?.answer || null,
      source_explanation_answer: explanationKey,
      raw_ocr_answer: rawKey,
      raw_ocr_conflicts_with_live: Boolean(rawKey && live && rawKey !== live.answer),
      already_applied: Boolean(live && live.explanation === proposal.explanation),
      warnings,
      issues,
      status: issues.length ? "hold" : warnings.length ? "ready_with_source_warning" : "ready_for_human_source_review",
    });
  }
}

const summary = {
  repair_scope_commit: "1c84aeb",
  repair_scope_questions: legacyRows.length,
  current_live_questions: liveRows.length,
  proposals: report.length,
  ready: report.filter((row) => row.status.startsWith("ready_")).length,
  held: report.filter((row) => row.status === "hold").length,
  already_applied: report.filter((row) => row.already_applied).length,
  raw_ocr_key_conflicts: report.filter((row) => row.raw_ocr_conflicts_with_live).length,
  rows: report,
};
console.log(JSON.stringify(summary, null, 2));
if (summary.held) process.exitCode = 1;
