"""Build a static site and discover uploaded HTML pages without dependencies."""
import json
import hashlib
import shutil
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRS = {"dist", "node_modules", "scripts", "tests", "__pycache__", "supabase", "content", "templates"}
EXCLUDED_FILES = {"site.config.json", "package.json", "package-lock.json", "README.md", "qbank-v2.html"}
PRIVATE_QBANK_INPUTS = {"data/questions.json", "data/question-overrides.json", "data/word-pilot-questions.json"}
PRIVATE_QBANK_IMAGE_DIRS = {"question-pages", "explanation-pages", "fa-pages", "question-figures", "question-images", "fa-figures"}
WEB_EXTENSIONS = {
    ".html", ".htm", ".css", ".js", ".mjs", ".json", ".map", ".svg", ".png",
    ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".woff", ".woff2",
    ".ttf", ".otf", ".pdf", ".txt", ".csv", ".mp3", ".mp4", ".wav",
    ".ogg", ".webm", ".wasm", ".webmanifest", ".xml",
}


class TitleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.inside = False
        self.parts = []
        self.quiz_parts = []
        self.quiz_inside = False

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self.inside = True
        if tag == "script" and dict(attrs).get("id") == "quiz-data":
            self.quiz_inside = True

    def handle_endtag(self, tag):
        if tag == "title":
            self.inside = False
        if tag == "script":
            self.quiz_inside = False

    def handle_data(self, data):
        if self.inside:
            self.parts.append(data)
        if self.quiz_inside:
            self.quiz_parts.append(data)


def public_files(root):
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if any(part.startswith(".") or part in EXCLUDED_DIRS for part in relative.parts):
            continue
        if relative.as_posix() in PRIVATE_QBANK_INPUTS or (relative.parts[:1] == ("assets",) and len(relative.parts) > 1 and relative.parts[1] in PRIVATE_QBANK_IMAGE_DIRS):
            continue
        if any(parent.is_symlink() for parent in [path, *path.parents] if parent != root.parent):
            continue
        if not path.is_file() or path.name in EXCLUDED_FILES:
            continue
        if path.suffix.lower() in WEB_EXTENSIONS:
            yield path, relative


def build(root=ROOT):
    root = Path(root).resolve()
    config_path = root / "site.config.json"
    config = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {}
    output = root / "dist"
    if output.is_symlink():
        raise ValueError("dist must not be a symlink")
    if output.exists():
        shutil.rmtree(output)
    if config.get("standaloneQuestionBank"):
        curated = public_question_rows(load_question_source(root, config), config)
        (output / "assets/question-pages").mkdir(parents=True, exist_ok=True)
        (output / "data").mkdir(parents=True, exist_ok=True)
        (output / "assets/vendor").mkdir(parents=True, exist_ok=True)
        app_page = root / "qbank-v2.html"
        if not app_page.is_file():
            app_page = root / "qbank.html"
        shutil.copyfile(app_page, output / "index.html")
        shutil.copyfile(app_page, output / "qbank.html")
        app_script = root / "assets/qbank-app.js"
        if app_script.is_file():
            shutil.copyfile(app_script, output / "assets/qbank-app.js")
        (output / "data/questions.json").write_text(json.dumps(curated, ensure_ascii=False) + "\n", encoding="utf-8")
        (output / "data/bank-meta.json").write_text(json.dumps({"verified": len(curated)}, ensure_ascii=False) + "\n", encoding="utf-8")
        cloud = config.get("cloud", {})
        public_cloud = {key: cloud.get(key, "") for key in ("url", "publishableKey")}
        key = public_cloud["publishableKey"]
        if key and not key.startswith("sb_publishable_"):
            raise ValueError("Use a Supabase publishable key, never a secret/service_role key")
        if public_cloud["url"] and not public_cloud["url"].startswith("https://"):
            raise ValueError("Cloud URL must use HTTPS")
        (output / "assets/cloud-config.json").write_text(json.dumps(public_cloud) + "\n", encoding="utf-8")
        if public_cloud["url"] and public_cloud["publishableKey"]:
            shutil.copyfile(root / "assets/cloud.js", output / "assets/cloud.js")
            vendor = root / "assets/vendor/supabase.js"
            if not vendor.is_file():
                raise FileNotFoundError("Supabase browser bundle was not created")
            shutil.copyfile(vendor, output / "assets/vendor/supabase.js")
        image_paths = sorted({
            image
            for question in curated
            for image in (question.get("question_images") or [])
        } | {
            question["question_image"]
            for question in curated
            if question.get("question_image")
        })
        for image in image_paths:
            source = (root / image).resolve()
            try:
                source.relative_to(root)
            except ValueError as exc:
                raise ValueError(f"Question image escapes project directory: {image}") from exc
            if not source.is_file():
                raise FileNotFoundError(f"Question image not found: {image}")
            shutil.copyfile(source, output / image)
        (output / ".nojekyll").touch()
        return {"title": config.get("title") or "USMLE Step 1 自建题库", "defaultPage": "index.html", "pages": [], "questions": len(curated)}
    files = list(public_files(root))
    pages = []
    for source, relative in files:
        # The legacy qbank.html is kept in the source checkout for reference;
        # serve the current cloud-backed qbank-v2 implementation at the stable URL.
        served_source = root / "qbank-v2.html" if relative.as_posix() == "qbank.html" else source
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(served_source, target)
        path = relative.as_posix()
        if source.suffix.lower() not in {".html", ".htm"} or path in {"index.html", "404.html"} or relative.parts[0] == "assets":
            continue
        parser = TitleParser()
        parser.feed(served_source.read_text(encoding="utf-8", errors="replace"))
        override = config.get("pages", {}).get(path, {})
        title = override.get("title") or " ".join("".join(parser.parts).split()) or source.stem
        category = override.get("category") or (relative.parent.as_posix() if relative.parent != Path(".") else "我的页面")
        page = {"path": path, "title": title, "category": category}
        if parser.quiz_parts:
            quiz = json.loads("".join(parser.quiz_parts))
            if quiz.get("version") != 2 or not quiz.get("questions"):
                raise ValueError(f"Invalid section template: {path}")
            ids = [q["id"] for q in quiz["questions"]]
            if len(ids) != len(set(ids)):
                raise ValueError(f"Duplicate question IDs: {path}")
            page["title"] = override.get("title") or quiz["section"]
            page["category"] = override.get("category") or quiz["category"]
            page["question_index"] = [{"id": q["id"], "title": q["title"]} for q in quiz["questions"]]
        pages.append(page)
    pages.sort(key=lambda page: (page["category"].casefold(), page["path"].casefold()))
    visible_pages = config.get("visiblePages")
    if visible_pages is not None:
        if not isinstance(visible_pages, list) or any(not isinstance(path, str) for path in visible_pages):
            raise ValueError("visiblePages must be a list of page paths")
        visible_set = {Path(path).as_posix() for path in visible_pages}
        pages = [page for page in pages if page["path"] in visible_set]
    default = config.get("defaultPage", "")
    if not any(page["path"] == default for page in pages):
        default = pages[0]["path"] if pages else ""
    catalog = {"title": config.get("title") or "TMU · Caleb", "defaultPage": default, "pages": pages}
    (output / "assets").mkdir(parents=True, exist_ok=True)
    (output / "assets/pages.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Keep raw OCR and correction inputs in the source repository, but include in
    # the local build only complete, manually reviewed questions needed by qbank.html.
    question_file = root / "data/questions.json"
    if question_file.is_file() or config.get("qbankPilotSource"):
        curated = public_question_rows(load_question_source(root, config), config)
        (output / "data").mkdir(parents=True, exist_ok=True)
        (output / "data/questions.json").write_text(json.dumps(curated, ensure_ascii=False) + "\n", encoding="utf-8")
        (output / "data/bank-meta.json").write_text(json.dumps({"verified": len(curated)}, ensure_ascii=False) + "\n", encoding="utf-8")
        image_paths = {image for q in curated for image in (q.get("question_images") or [])}
        image_paths.update(image for q in curated for image in (q.get("explanation_images") or []))
        image_paths.update(q["question_image"] for q in curated if q.get("question_image"))
        image_paths = sorted(image_paths)
        for image in image_paths:
            source = (root / image).resolve()
            try:
                source.relative_to(root)
            except ValueError as exc:
                raise ValueError(f"Question image escapes project directory: {image}") from exc
            if not source.is_file():
                raise FileNotFoundError(f"Question image not found: {image}")
            target = output / image
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    cloud = config.get("cloud", {})
    public_cloud = {key: cloud.get(key, "") for key in ("url", "publishableKey")}
    key = public_cloud["publishableKey"]
    if key and not key.startswith("sb_publishable_"):
        raise ValueError("Use a Supabase publishable key, never a secret/service_role key")
    if public_cloud["url"] and not public_cloud["url"].startswith("https://"):
        raise ValueError("Cloud URL must use HTTPS")
    (output / "assets/cloud-config.json").write_text(json.dumps(public_cloud) + "\n", encoding="utf-8")
    template = root / "templates/小节题库模板.html"
    if template.exists():
        (output / "downloads").mkdir(exist_ok=True)
        shutil.copyfile(template, output / "downloads/小节题库模板.html")
    (output / ".nojekyll").touch()
    return catalog


def curated_questions(rows, reviewed):
    curated = []
    for row in rows:
        correction = reviewed.get(row.get("id"))
        if not correction or correction.get("reviewed") is not True or correction.get("review_required") is True:
            continue
        item = {**row, **correction}
        if not item.get("fa_subchapter"):
            item["fa_subchapter"] = item.get("subchapter") or item.get("subcategory") or ""
        # Raw OCR page screenshots can reveal question text, options, or keyed answers.
        # Publish only figure/table crops that were explicitly reviewed for inclusion.
        if correction.get("question_figures_reviewed") is not True:
            item["question_images"] = []
            item["question_image"] = None
        if correction.get("explanation_figures_reviewed") is not True:
            item["explanation_images"] = []
        if correction.get("fa_figures_reviewed") is not True:
            item["fa_images"] = []
        if isinstance(item.get("option_fa"), dict):
            item["option_fa"] = {
                letter: ref if ref.get("image_reviewed") is True else {**ref, "image": None, "images": []}
                for letter, ref in item["option_fa"].items()
            }
        if item.get("complete") and item.get("chapter") and item.get("stem") and item.get("answer") and len(item.get("options", [])) >= 2 and item.get("explanation"):
            curated.append(item)
    return curated


def load_question_source(root, config):
    pilot_source = config.get("qbankPilotSource")
    if pilot_source:
        source = (root / pilot_source).resolve()
        try:
            source.relative_to(root)
        except ValueError as exc:
            raise ValueError("qbankPilotSource must stay within the project") from exc
        if not source.is_file():
            raise FileNotFoundError(f"Question pilot data not found: {pilot_source}")
        questions = json.loads(source.read_text(encoding="utf-8"))
        if not isinstance(questions, list):
            raise ValueError("qbankPilotSource must contain a JSON array")
        required = ("id", "chapter", "stem", "options", "answer", "explanation")
        for index, question in enumerate(questions, start=1):
            missing = [field for field in required if not question.get(field)]
            if missing:
                raise ValueError(f"Pilot question {index} is missing: {', '.join(missing)}")
            letters = {option.get("letter") for option in question.get("options", [])}
            if len(letters) < 2 or question["answer"] not in letters:
                raise ValueError(f"Pilot question {index} has invalid choices or answer key")
        return curated_questions(questions, {question.get("id"): question for question in questions if question.get("id")})

    question_file = root / "data/questions.json"
    rows = json.loads(question_file.read_text(encoding="utf-8"))
    overrides_file = root / "data/question-overrides.json"
    reviewed = json.loads(overrides_file.read_text(encoding="utf-8")) if overrides_file.is_file() else {}
    return curated_questions(rows, reviewed)


def public_question_rows(curated, config):
    pilot_limit = config.get("qbankPilotCount")
    if pilot_limit is not None:
        if not isinstance(pilot_limit, int) or isinstance(pilot_limit, bool) or pilot_limit < 1:
            raise ValueError("qbankPilotCount must be a positive integer")
        curated = curated[:pilot_limit]
    public = []
    for question in curated:
        source_id = question.get("id", "")
        source_file = question.get("source_file", "")
        pages = question.get("source_pdf_pages") or []
        if isinstance(pages, dict):
            pages = pages.get("question") or []
        page_text = ",".join(str(page) for page in pages) if isinstance(pages, list) else str(pages)
        digest_input = f"{source_file}\n{source_id}\n{page_text}"
        cloud_id = "qb-" + hashlib.sha256(digest_input.encode("utf-8")).digest()[:20].hex()
        item = {**question, "id": cloud_id, "cloud_id": cloud_id}
        # The public UI uses a question-level First Aid cross-reference only.
        item.pop("option_fa", None)
        item.pop("fa_images", None)
        item.pop("fa_figures_reviewed", None)
        for field in (
            "source_file", "source_pdf", "source_pdf_pages", "explanation_pdf_pages", "question_number",
            "fa_page_candidate", "audit", "qa", "first_aid_2026", "media_audit", "choice_explanations_audit",
            "option_fa_audit", "option_fa_review_policy", "question_audit_status", "visually_verified",
            "review_status", "qa_note", "docx_file", "source_qa", "source_id",
            "source_question_number_for_audit_only", "fa_mapping", "fa_page_status", "first_aid_printed_page",
            "required_figure", "visual_reference", "has_image_reference",
            "subchapter", "subcategory",
        ):
            item.pop(field, None)
        if item.get("fa_page_verified") is not True:
            item.pop("fa_page", None)
            item.pop("fa_pages", None)
        elif not isinstance(item.get("fa_pages"), list):
            item["fa_pages"] = [item["fa_page"]] if isinstance(item.get("fa_page"), int) else []
        public.append(item)
    return public


if __name__ == "__main__":
    result = build()
    if "questions" in result:
        print(f"Built standalone qbank with {result['questions']} verified questions into dist/")
    else:
        print(f"Built {len(result['pages'])} pages into dist/")
