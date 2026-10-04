import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("build_site", Path(__file__).resolve().parents[1] / "scripts/build.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.write("index.html", "<title>Framework</title>")

    def write(self, path, value):
        dest = self.root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(value, encoding="utf-8")

    def test_upload_discovery_titles_categories_and_resources(self):
        self.write("2.html", "<title>Second &amp; example</title>")
        self.write("生物化学/章节 #1.HTML", "<title>维生素</title><img src='./image.svg'>")
        self.write("生物化学/image.svg", "<svg></svg>")
        result = module.build(self.root)
        pages = {p["path"]: p for p in result["pages"]}
        self.assertEqual(len(pages), 2)
        self.assertEqual(pages["2.html"]["title"], "Second & example")
        self.assertEqual(pages["生物化学/章节 #1.HTML"]["category"], "生物化学")
        self.assertTrue((self.root / "dist/生物化学/image.svg").exists())

    def test_config_and_deleted_default_fallback(self):
        self.write("1.html", "<p>no title</p>")
        self.write("site.config.json", json.dumps({"defaultPage": "deleted.html", "pages": {"1.html": {"title": "自定名称", "category": "基础科学"}}}))
        result = module.build(self.root)
        self.assertEqual(result["defaultPage"], "1.html")
        self.assertEqual(result["pages"][0]["title"], "自定名称")
        self.assertEqual(result["pages"][0]["category"], "基础科学")

    def test_visible_pages_hides_old_pages_from_workbench_without_deleting_sources(self):
        self.write("qbank.html", "<title>Step 1 Qbank</title>")
        self.write("qbank-v2.html", "<title>Cloud-backed qbank</title>")
        self.write("基础科学/旧页面.html", "<title>Old study page</title>")
        self.write("site.config.json", json.dumps({"visiblePages": ["qbank.html"]}))
        result = module.build(self.root)
        self.assertEqual([page["path"] for page in result["pages"]], ["qbank.html"])
        self.assertTrue((self.root / "基础科学/旧页面.html").is_file())
        self.assertTrue((self.root / "dist/基础科学/旧页面.html").is_file())

    def test_excludes_infrastructure_and_symlinks(self):
        for path in [".git/config", ".openai/hosting.json", "tests/fixture.html", "scripts/data.json", "node_modules/demo.html", "private.key", "supabase/migrations/data.json"]:
            self.write(path, "not public")
        self.write("real.html", "<title>Real</title>")
        try:
            (self.root / "shortcut.html").symlink_to(self.root / "real.html")
        except OSError as error:
            if getattr(error, "winerror", None) == 1314:
                self.skipTest("Windows symlink creation requires Developer Mode or elevated privileges")
            raise
        result = module.build(self.root)
        self.assertEqual([p["path"] for p in result["pages"]], ["real.html"])
        self.assertFalse((self.root / "dist/.openai").exists())
        self.assertFalse((self.root / "dist/shortcut.html").exists())
        self.assertFalse((self.root / "dist/private.key").exists())

    def test_section_index_and_template_download_are_separate(self):
        quiz = {"version": 2, "section": "细胞生物学", "category": "基础科学", "questions": [{"id": "q1", "title": "题一"}, {"id": "q2", "title": "题二"}]}
        self.write("基础科学/section.html", '<title>Old</title><script id="quiz-data" type="application/json">' + json.dumps(quiz) + '</script>')
        self.write("templates/小节题库模板.html", "<title>Template</title>")
        result = module.build(self.root)
        self.assertEqual(len(result["pages"]), 1)
        self.assertEqual(result["pages"][0]["title"], "细胞生物学")
        self.assertEqual(len(result["pages"][0]["question_index"]), 2)
        self.assertTrue((self.root/"dist/downloads/小节题库模板.html").exists())
        self.assertFalse((self.root/"dist/templates").exists())

    def test_rebuild_removes_deleted_pages_and_empty_catalog(self):
        self.write("old.html", "<title>Old</title>")
        module.build(self.root)
        (self.root / "old.html").unlink()
        result = module.build(self.root)
        self.assertEqual(result["pages"], [])
        self.assertEqual(result["defaultPage"], "")
        self.assertFalse((self.root / "dist/old.html").exists())
        self.assertTrue((self.root / "dist/.nojekyll").exists())

    def test_standalone_qbank_copies_v2_app_and_public_cloud_config(self):
        self.write("site.config.json", json.dumps({"standaloneQuestionBank": True, "cloud": {"url": "https://example.supabase.co", "publishableKey": "sb_publishable_test"}}))
        self.write("qbank.html", "old page")
        self.write("qbank-v2.html", "new page")
        self.write("assets/qbank-app.js", "app")
        self.write("assets/cloud.js", "cloud")
        self.write("assets/vendor/supabase.js", "vendor")
        self.write("data/questions.json", json.dumps([{"id":"reviewed","question_images":[]},{"id":"raw-only","question_image":"private.jpg"}], ensure_ascii=False))
        self.write("data/question-overrides.json", json.dumps({"reviewed":{"reviewed":True,"complete":True,"chapter":"Biochemistry","stem":"Stem","answer":"A","options":[{"letter":"A","text":"Answer"},{"letter":"B","text":"Distractor"}],"explanation":"Reviewed explanation"}}, ensure_ascii=False))
        self.write("private.jpg", "private image")
        module.build(self.root)
        for name in ["index.html", "qbank.html"]:
            self.assertEqual((self.root / "dist" / name).read_text(encoding="utf-8"), "new page")
        self.assertEqual((self.root / "dist/assets/qbank-app.js").read_text(encoding="utf-8"), "app")
        self.assertEqual((self.root / "dist/assets/vendor/supabase.js").read_text(encoding="utf-8"), "vendor")
        self.assertFalse((self.root / "dist/data/question-overrides.json").exists())
        public_questions=json.loads((self.root / "dist/data/questions.json").read_text(encoding="utf-8"))
        self.assertEqual(len(public_questions), 1)
        self.assertRegex(public_questions[0]["id"], r"^qb-[a-f0-9]{40}$")
        self.assertEqual(public_questions[0]["id"], public_questions[0]["cloud_id"])
        self.assertFalse((self.root / "dist/private.jpg").exists())
        self.assertEqual(json.loads((self.root / "dist/data/bank-meta.json").read_text(encoding="utf-8"))["verified"], 1)
        config = json.loads((self.root / "dist/assets/cloud-config.json").read_text(encoding="utf-8"))
        self.assertEqual(config["url"], "https://example.supabase.co")

    def test_workspace_keeps_root_and_registers_curated_qbank_page(self):
        self.write("site.config.json", json.dumps({"title":"Workspace", "defaultPage":"qbank.html", "pages":{"qbank.html":{"title":"Step 1 Qbank", "category":"USMLE Step 1"}}}))
        self.write("index.html", "<title>Original workspace</title><main>home</main>")
        self.write("qbank.html", "<title>Question bank</title>")
        self.write("qbank-v2.html", "<title>Cloud-backed qbank</title><script type=module src='./assets/qbank-app.js'></script>")
        self.write("assets/qbank-app.js", "qbank")
        self.write("assets/question-pages/raw.jpg", "raw image")
        self.write("assets/question-images/unrelated.jpg", "unrelated source image")
        self.write("data/questions.json", json.dumps([{"id":"ok","source_file":"private.pdf","source_pdf":"private folder/private.pdf","source_pdf_pages":{"question":[2,3],"explanation":[4]},"explanation_pdf_pages":[4],"question_number":7,"question_images":["assets/question-pages/raw.jpg"],"question_image":"assets/question-pages/raw.jpg","explanation_images":["assets/explanation-pages/review.jpg"]},{"id":"figure","question_images":["assets/question-figures/crop.jpg"],"question_image":"assets/question-figures/crop.jpg"},{"id":"raw","complete":True,"chapter":"Biochemistry","stem":"Unreviewed OCR","answer":"A","options":[{"letter":"A","text":"raw"},{"letter":"B","text":"raw"}],"explanation":"raw OCR"},{"id":"not-explicitly-reviewed"}]))
        self.write("data/question-overrides.json", json.dumps({"ok":{"reviewed":True,"complete":True,"chapter":"Biochemistry","stem":"Reviewed stem","answer":"A","options":[{"letter":"A","text":"yes"},{"letter":"B","text":"no"}],"explanation":"Reviewed explanation","audit":{"source_docx":"private.docx"},"qa":{"status":"verified"},"fa_page_verified":True,"fa_page":463,"fa_pages":[463,465],"fa_page_candidate":999,"option_fa":{"A":{"page":463,"text":"Verified FA passage","images":["assets/fa-pages/p463.jpg"]}}},"figure":{"reviewed":True,"complete":True,"chapter":"Biochemistry","stem":"Figure-dependent stem","answer":"A","options":[{"letter":"A","text":"yes"},{"letter":"B","text":"no"}],"explanation":"Reviewed explanation","question_figures_reviewed":True,"question_figure_description":"Reviewed crop","question_images":["assets/question-figures/crop.jpg"],"question_image":"assets/question-figures/crop.jpg","option_fa":{"A":{"page":463,"verified":True,"text":"Verified cropped FA diagram","image_reviewed":True,"images":["assets/fa-figures/crop.jpg"]}}},"not-explicitly-reviewed":{"complete":True,"chapter":"Biochemistry","stem":"Still OCR","answer":"A","options":[{"letter":"A","text":"x"},{"letter":"B","text":"y"}],"explanation":"unreviewed"}}))
        self.write("assets/fa-pages/p463.jpg", "FA image")
        self.write("assets/fa-figures/crop.jpg", "reviewed FA crop")
        self.write("assets/question-figures/crop.jpg", "reviewed figure crop")
        self.write("assets/explanation-pages/review.jpg", "explanation image")
        self.write("assets/question-pages/raw.jpg", "full screenshot with answer choices")
        result = module.build(self.root)
        self.assertEqual((self.root / "dist/index.html").read_text(encoding="utf-8"), "<title>Original workspace</title><main>home</main>")
        qbank = next(page for page in result["pages"] if page["path"] == "qbank.html")
        self.assertEqual(qbank["category"], "USMLE Step 1")
        self.assertEqual(result["defaultPage"], "qbank.html")
        self.assertIn("qbank-app.js", (self.root / "dist/qbank.html").read_text(encoding="utf-8"))
        self.assertFalse((self.root / "dist/qbank-v2.html").exists())
        published = json.loads((self.root / "dist/data/questions.json").read_text(encoding="utf-8"))
        self.assertEqual(len(published), 2)
        self.assertRegex(published[0]["id"], r"^qb-[a-f0-9]{40}$")
        self.assertEqual(published[0]["id"], published[0]["cloud_id"])
        for field in ["source_file", "source_pdf", "source_pdf_pages", "explanation_pdf_pages", "question_number", "fa_page_candidate"]:
            self.assertNotIn(field, published[0])
        self.assertEqual(published[0]["fa_page"], 463)
        self.assertEqual(published[0]["fa_pages"], [463, 465])
        self.assertNotIn("audit", published[0])
        self.assertNotIn("qa", published[0])
        self.assertTrue(published[0]["reviewed"])
        self.assertTrue(published[0]["complete"])
        self.assertNotIn("option_fa", published[0])
        self.assertEqual(published[0]["question_images"], [])
        self.assertIsNone(published[0]["question_image"])
        self.assertTrue(published[1]["question_figures_reviewed"])
        self.assertFalse((self.root / "dist/assets/fa-pages/p463.jpg").exists())
        self.assertFalse((self.root / "dist/assets/fa-figures/crop.jpg").exists())
        self.assertFalse((self.root / "dist/assets/explanation-pages/review.jpg").exists())
        self.assertTrue((self.root / "dist/assets/question-figures/crop.jpg").is_file())
        self.assertFalse((self.root / "dist/assets/question-pages/raw.jpg").exists())
        self.assertFalse((self.root / "dist/assets/question-images/unrelated.jpg").exists())
        self.assertFalse((self.root / "dist/data/question-overrides.json").exists())
        self.assertFalse((self.root / "dist/assets/question-pages/unused.jpg").exists())

    def test_pilot_count_limits_public_questions_without_changing_local_source_rows(self):
        rows=[{"id":"first"},{"id":"second"}]
        selected=module.public_question_rows(rows,{"qbankPilotCount":1})
        self.assertEqual(len(selected),1)
        self.assertEqual(selected[0]["id"],selected[0]["cloud_id"])
        with self.assertRaises(ValueError):
            module.public_question_rows(rows,{"qbankPilotCount":0})

    def test_word_pilot_source_builds_curated_questions_without_copying_input(self):
        self.write("site.config.json", json.dumps({"qbankPilotSource":"data/word-pilot-questions.json","qbankPilotCount":1}))
        self.write("qbank.html", "<title>Old</title>")
        self.write("qbank-v2.html", "<title>Qbank</title>")
        self.write("assets/qbank-app.js", "app")
        self.write("data/word-pilot-questions.json", json.dumps([{
            "id":"wordpilot-a","chapter":"Biochemistry","fa_subchapter":"Genetics",
            "stem":"Stem","options":[{"letter":"A","text":"Yes"},{"letter":"B","text":"No"}],
            "answer":"A","explanation":"Explanation","reviewed":True,"complete":True,
            "source_file":"private.docx"
        }], ensure_ascii=False))
        module.build(self.root)
        output = json.loads((self.root / "dist/data/questions.json").read_text(encoding="utf-8"))
        self.assertEqual(len(output), 1)
        self.assertEqual(output[0]["chapter"], "Biochemistry")
        self.assertRegex(output[0]["id"], r"^qb-[a-f0-9]{40}$")
        self.assertNotIn("source_file", output[0])
        self.assertFalse((self.root / "dist/data/word-pilot-questions.json").exists())

    def test_curated_questions_normalizes_imported_fa_subchapter_names(self):
        options = [{"letter":"A","text":"yes"},{"letter":"B","text":"no"}]
        row = {"id":"subtopic","stem":"Stem","answer":"A","options":options,"explanation":"Explanation"}
        curated = module.curated_questions([row], {"subtopic":{"reviewed":True,"complete":True,"chapter":"Biochemistry","subchapter":"Metabolism"}})
        self.assertEqual(curated[0]["fa_subchapter"], "Metabolism")
        self.assertNotIn("subchapter", module.public_question_rows(curated, {})[0])

    def test_pilot_source_excludes_unreviewed_or_incomplete_rows(self):
        self.write("site.config.json", json.dumps({"qbankPilotSource":"data/word-pilot-questions.json"}))
        self.write("qbank.html", "<title>Old</title>")
        self.write("qbank-v2.html", "<title>Qbank</title>")
        self.write("assets/qbank-app.js", "app")
        options = [{"letter":"A","text":"yes"},{"letter":"B","text":"no"}]
        self.write("data/word-pilot-questions.json", json.dumps([
            {"id":"ok","chapter":"Biochemistry","stem":"Stem","answer":"A","options":options,"explanation":"Explanation","reviewed":True,"complete":True},
            {"id":"draft","chapter":"Biochemistry","stem":"Draft","answer":"A","options":options,"explanation":"Draft explanation","reviewed":False,"complete":True},
        ]))
        module.build(self.root)
        output = json.loads((self.root / "dist/data/questions.json").read_text(encoding="utf-8"))
        self.assertEqual(len(output), 1)
        self.assertEqual(output[0]["stem"], "Stem")



if __name__ == "__main__":
    unittest.main()
