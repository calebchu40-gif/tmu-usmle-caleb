"""Build a static site and discover uploaded HTML pages without dependencies."""
import json
import shutil
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRS = {"dist", "node_modules", "scripts", "tests", "__pycache__", "supabase"}
EXCLUDED_FILES = {"site.config.json", "package.json", "package-lock.json", "README.md"}
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

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self.inside = True

    def handle_endtag(self, tag):
        if tag == "title":
            self.inside = False

    def handle_data(self, data):
        if self.inside:
            self.parts.append(data)


def public_files(root):
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if any(part.startswith(".") or part in EXCLUDED_DIRS for part in relative.parts):
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
    files = list(public_files(root))
    pages = []
    for source, relative in files:
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        path = relative.as_posix()
        if source.suffix.lower() not in {".html", ".htm"} or path in {"index.html", "404.html"} or relative.parts[0] == "assets":
            continue
        parser = TitleParser()
        parser.feed(source.read_text(encoding="utf-8", errors="replace"))
        override = config.get("pages", {}).get(path, {})
        title = override.get("title") or " ".join("".join(parser.parts).split()) or source.stem
        category = override.get("category") or (relative.parent.as_posix() if relative.parent != Path(".") else "我的页面")
        pages.append({"path": path, "title": title, "category": category})
    pages.sort(key=lambda page: (page["category"].casefold(), page["path"].casefold()))
    default = config.get("defaultPage", "")
    if not any(page["path"] == default for page in pages):
        default = pages[0]["path"] if pages else ""
    catalog = {"title": config.get("title") or "TMU · Caleb", "defaultPage": default, "pages": pages}
    (output / "assets").mkdir(parents=True, exist_ok=True)
    (output / "assets/pages.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    cloud = config.get("cloud", {})
    public_cloud = {key: cloud.get(key, "") for key in ("url", "publishableKey")}
    key = public_cloud["publishableKey"]
    if key and not key.startswith("sb_publishable_"):
        raise ValueError("Use a Supabase publishable key, never a secret/service_role key")
    if public_cloud["url"] and not public_cloud["url"].startswith("https://"):
        raise ValueError("Cloud URL must use HTTPS")
    (output / "assets/cloud-config.json").write_text(json.dumps(public_cloud) + "\n", encoding="utf-8")
    (output / ".nojekyll").touch()
    return catalog


if __name__ == "__main__":
    result = build()
    print(f"Built {len(result['pages'])} pages into dist/")
