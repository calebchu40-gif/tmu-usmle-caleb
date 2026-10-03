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
        self.write("data/question-overrides.json", json.dumps({"reviewed":{"complete":True,"chapter":"Biochemistry","stem":"Stem","answer":"A","options":[{"letter":"A","text":"Answer"},{"letter":"B","text":"Distractor"}],"explanation":"Reviewed explanation"}}, ensure_ascii=False))
        self.write("private.jpg", "private image")
        module.build(self.root)
        for name in ["index.html", "qbank.html"]:
            self.assertEqual((self.root / "dist" / name).read_text(encoding="utf-8"), "new page")
        self.assertEqual((self.root / "dist/assets/qbank-app.js").read_text(encoding="utf-8"), "app")
        self.assertEqual((self.root / "dist/assets/vendor/supabase.js").read_text(encoding="utf-8"), "vendor")
        self.assertTrue((self.root / "dist/data/question-overrides.json").is_file())
        public_questions=json.loads((self.root / "dist/data/questions.json").read_text(encoding="utf-8"))
        self.assertEqual([q["id"] for q in public_questions], ["reviewed"])
        self.assertFalse((self.root / "dist/private.jpg").exists())
        self.assertEqual(json.loads((self.root / "dist/data/bank-meta.json").read_text(encoding="utf-8"))["source_total"], 2)
        config = json.loads((self.root / "dist/assets/cloud-config.json").read_text(encoding="utf-8"))
        self.assertEqual(config["url"], "https://example.supabase.co")



if __name__ == "__main__":
    unittest.main()
