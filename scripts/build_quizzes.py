"""Generate self-contained section HTMLs and a copyable upload template."""
import html
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
TARGETS = {
    'cell-biology': '基础科学/细胞周期与遗传信息.html',
    'nutrition-vitamins': '生物化学/新生儿黄疸与核黄素.html',
    'upload-test': 'tests/fixtures/上传测试小节.html',
}
def render(data, hosted=False):
    shell = (ROOT / 'templates/section-shell.html').read_text()
    encoded = json.dumps(data, ensure_ascii=False, indent=2).replace('<', '\\u003c')
    boot = '<script src="../assets/open-standalone.js"></script>' if hosted else ''
    return shell.replace('__HOST_BOOT__', boot).replace('__TITLE__', html.escape(data['category']+' · '+data['section'])).replace('__CSS__', (ROOT/'assets/quiz.css').read_text()).replace('__DATA__', encoded).replace('__JS__',(ROOT/'assets/quiz.js').read_text())
def generate():
    for source, target in TARGETS.items():
        data = json.loads((ROOT / f'content/{source}.json').read_text())
        (ROOT / target).write_text(render(data,hosted=not target.startswith('tests/')), encoding='utf-8')
    data = json.loads((ROOT/'content/cell-biology.json').read_text())
    data['id']='your-section-id'
    data['description']='修改小节名称与 questions 里的题目，然后另存为“分类/小节.html”上传。'
    (ROOT/'templates/小节题库模板.html').write_text(render(data),encoding='utf-8')
if __name__ == '__main__':
    generate()
