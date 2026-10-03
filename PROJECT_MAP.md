# Project map and current architecture

Last reviewed: 2026-10-04 (Asia/Shanghai)

## Authoritative project copy

- Current deployed GitHub repository: `calebchu40-gif/tmu-usmle-caleb`, branch `main`. Current checkout commit: `fcdc77b` (`Require authorized sign-in before opening study content`).
- Working copy used for current repository changes: `C:\Users\yawch\OneDrive\Desktop\U\tmu-qbank-publish`.
- `C:\Users\yawch\OneDrive\Desktop\U\tmu-usmle-caleb\tmu-usmle-caleb` is a separate checkout at older commit `c1f06e9`; it is useful as a reference for the original workbench format, but is not the current remote head.
- `C:\Users\yawch\OneDrive\Desktop\U\tmu-usmle-caleb-github` is another older, locally modified checkout. Do not use it as the publishing source without reconciling its local changes.

## Page and build flow

1. `index.html`, `assets/app.js`, `assets/app.css`, and `assets/personal.js` implement the original TMU · Caleb study workspace: left-side categorized page navigation, account area, and an iframe viewer for learning pages.
2. `scripts/build.py` discovers and copies categorized HTML pages, then generates `dist/assets/pages.json`, cloud configuration, and a filtered question payload. The current `site.config.json` keeps `index.html` as the workbench, lists `qbank.html` under `USMLE Step 1`, and explicitly builds from `data/word-pilot-questions.json` with `qbankPilotCount: 20`. A fresh local build confirmed `dist/data/bank-meta.json` reports 20 questions. Reviewed additions must be merged into the published question source and the 20-question cap deliberately removed before deployment. The obsolete `qbank-v2.html` prototype is not listed as a separate page or copied under its prototype URL.
3. `.github/workflows/pages.yml` tests and builds on pushes to `main`, then deploys `dist/` to GitHub Pages. The custom domain DNS CNAME points to `calebchu40-gif.github.io`.
4. The question bank is `qbank.html` plus `assets/qbank-app.js`. It appears as a categorized page in the workbench directory, but its catalog link opens the stable qbank URL directly instead of embedding one full application inside another. This avoids duplicate sidebars and gives the qbank its normal HTTPS origin for Supabase session storage and secure-context APIs. Other learning pages continue to use the workbench's isolated iframe viewer.

## Question content and answer history

- `data/questions.json` is the extracted 1,175-row working corpus; `data/question-overrides.json` contains hand-curated corrections.
- The static question payload is served from the published site, so any device opening the site can use the same published bank. The current build takes the 20-question Word pilot source, rather than the large OCR corpus. For the normal corpus path, `data/question-overrides.json` acts as an allowlist and `scripts/build.py` omits raw OCR/correction inputs, emitting only complete manually reviewed rows and referenced images.
- Current `assets/qbank-app.js` loads question text from static files in the site, not from a database table. Questions therefore reach all devices through the published website but are publicly fetchable. Supabase currently backs per-user progress/history; `study_questions` does not exist in the confirmed schema.
- `assets/cloud.js` connects to the Supabase project configured in `site.config.json`. `workspace_owner` gates the authorized study account. `study_records` and `study_attempts` hold per-user answers, counts, marks, and history; `study_favorites`, `study_pages`, and the `study_question_event` RPC support the wider workspace.
- Read-only PostgREST checks confirmed that `study_records`, `study_favorites`, `study_pages`, and `study_attempts` exist in the configured Supabase project. `study_questions` does not exist. The unauthenticated role correctly has no read access to the personal study tables. This check did not read user data or authenticate as the owner.
- Migrations `001`–`004` describe the database schema in the repository. The repo alone cannot prove which migration versions are applied remotely. Migration `004` adds elapsed-time storage; runtime code has a compatibility fallback if that migration is not active.

## Important defects and required integration direction

- A high-resolution audit of the Kaplan corpus found a major OCR grouping defect: separate test/session blocks inside a PDF reuse `Item 1 of N`, but the old extractor keyed only on item number and merged different questions. In a corpus audit, 292/1,175 rows had no structured choices, 104 had no answer, and many rows had implausibly wide source-page spans. These are automatic risk flags, not verified repairs.
- The OCR grouping code now has a tested session/run grouper in `USMLE_Study_Prep/kaplan_grouping.mjs`. A separate postprocessor is being prepared to regroup completed per-page OCR without changing the original PDFs or losing useful OCR work.
- Preserve the existing workbench and categorized page format. Do not use the standalone build switch as the final site architecture. Integrate the question bank as a normal categorized page inside the workbench, keeping existing study pages and the owner account flow.
- Current user direction is to pause account/Supabase-auth work and focus on question preparation and upload. Do not change authentication while paused. Publish reviewed question data as static GitHub Pages content (available across devices); maintain the distinction from private per-user progress sync. Do not publish unreviewed OCR or source-page screenshots containing answer reveals; retain only reviewed relevant figure/table crops.
- Import-preparation checkpoint (2026-10-04): four reviewed Word-first batches are reconciled and merged as 116 unique records in `data/word-pilot-questions.json`; `site.config.json` now loads the full reviewed source rather than capping it at 20. Five image/data-dependent system items and confirmed duplicates remain held out. All 116 records pass production eligibility, relevant image paths exist, and build output strips source/audit bookkeeping. Commit `1eed259` is live on GitHub Pages; `WORKLOG.md` contains the public count verification and QA disposition.

## Domain diagnosis

- The custom domain resolves to GitHub Pages and both HTTP and HTTPS served the same site during the check. The HTTP endpoint did not redirect to HTTPS; HTTPS was reachable. The user reports having obtained the TLS certificate. A prior screenshot's `crypto.subtle.digest` failure is consistent with opening the site over insecure HTTP, because this browser API is only available in secure contexts. Use the `https://www.tmu-usmle-caleb.cn/` URL for verification.

