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
        (self.root / "shortcut.html").symlink_to(self.root / "real.html")
        result = module.build(self.root)
        self.assertEqual([p["path"] for p in result["pages"]], ["real.html"])
        self.assertFalse((self.root / "dist/.openai").exists())
        self.assertFalse((self.root / "dist/shortcut.html").exists())
        self.assertFalse((self.root / "dist/private.key").exists())

    def test_rebuild_removes_deleted_pages_and_empty_catalog(self):
        self.write("old.html", "<title>Old</title>")
        module.build(self.root)
        (self.root / "old.html").unlink()
        result = module.build(self.root)
        self.assertEqual(result["pages"], [])
        self.assertEqual(result["defaultPage"], "")
        self.assertFalse((self.root / "dist/old.html").exists())
        self.assertTrue((self.root / "dist/.nojekyll").exists())



if __name__ == "__main__":
    unittest.main()
