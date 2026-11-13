# Project map and current architecture

Last reviewed: 2026-11-13 (Asia/Shanghai)

## Authoritative project copy

- Deployed GitHub repository: `calebchu40-gif/tmu-usmle-caleb`, branch `main`, published at https://www.tmu-usmle-caleb.cn/ via GitHub Pages.
- Working copy used for current repository changes: `C:\Users\yawch\OneDrive\Desktop\U\tmu-qbank-figure-import`.
- `C:\Users\yawch\OneDrive\Desktop\U\tmu-qbank-publish` is another checkout of the same repository (older commit, with local changes). Reconcile before using it as a publishing source.

## Product model (changed 2026-11-13)

The site is a **public, account-free study site**. Every visitor sees exactly the same catalog, questions, explanations and images. There is no sign-up, no sign-in, no Supabase, and no per-user server data.

- Previously the workbench and the question bank were gated behind a Supabase account (`workspace_owner` allowlist, per-user `study_records`). That login flow was removed because the owner could no longer sign in.
- Per-person state that used to live in Supabase (answers, marks, notes, favorites) now lives in the visitor's own browser through `assets/study-store.js`. It is device-local by design.

## Page and build flow

1. `index.html` + `assets/app.js` + `assets/app.css` + `assets/personal.js` render the workbench: categorized navigation, search, favorites, records, review and a sandboxed iframe viewer. The catalog is whatever `dist/assets/pages.json` lists.
2. `qbank-v2.html` + `assets/qbank-app.js` are the question bank. `scripts/build.py` serves `qbank-v2.html` at the stable `/qbank.html` URL and keeps the legacy `qbank.html` file out of the build.
3. `assets/study-store.js` implements the browser store (`StudyStore`, exposed as `window.connectStudyStore`) used by both the workbench and the question bank: `study_records`, `study_favorites`, `study_pages`, request-id receipts, and `clearLearningData`.
4. `scripts/build.py` copies every publishable HTML/CSS/JS/image file into `dist/`, writes `dist/assets/pages.json`, and writes the filtered question payload `dist/data/questions.json` from `data/word-pilot-questions.json` (`qbankPilotSource`). `site.config.json` has no `visiblePages`, so every discovered page appears in the workbench.
5. `.github/workflows/pages.yml` runs the tests, builds, and deploys `dist/` to GitHub Pages on every push to `main`. DNS CNAME for the custom domain points to `calebchu40-gif.github.io`.

## Content rules

- `data/questions.json` is the extracted working corpus; `data/question-overrides.json` holds hand-curated corrections. `data/word-pilot-questions.json` is the reviewed source the build publishes.
- `scripts/build.py` strips source/audit bookkeeping and only ships reviewed figures (`question_figures_reviewed` / `explanation_figures_reviewed`). Raw OCR page screenshots are never published.
- Known content risk: an OCR grouping defect merged items that reuse `Item 1 of N` across test blocks. Flags in the corpus are risk markers, not verified repairs.

## Verification

- `npm test` — Python build tests plus Node/JSDOM tests for the workbench, the browser store and the question bank.
- `npm run build` — writes `dist/`; `dist/assets/pages.json` should list every page under `dist/`.
- No page may reference `cloud.js`, Supabase, or a login form; the site must render its catalog with JavaScript and no network calls other than its own static files.
