"""Merge reviewed figure handoff crops into the question bank.

Only entries with every required figure resolved are published. This script is
intentionally separate from the general proposal merger so unrelated local
repairs and unreviewed figure candidates never enter a release accidentally.
"""

import argparse
import glob
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
U = ROOT.parent
BANK = ROOT / "data" / "word-pilot-questions.json"
HANDOFF = U / "tmp" / "HANDOFF_figures_verified.json"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def proposal_index():
    result = {}
    for folder in (U / "tmp" / "figproc", U / "tmp" / "figready"):
        for name in glob.glob(str(folder / "*.json")):
            if name.endswith("-ledger.json") or Path(name).name.startswith("_"):
                continue
            rows = read_json(Path(name))
            if not isinstance(rows, list):
                continue
            for row in rows:
                if row.get("id"):
                    result[row["id"]] = row
    return result


def safe_images(paths):
    if not isinstance(paths, list):
        raise ValueError("image list must be an array")
    for name in paths:
        if not isinstance(name, str) or not name.startswith("assets/question-figures/"):
            raise ValueError(f"unsafe figure path: {name!r}")
        path = (ROOT / name).resolve()
        if ROOT not in path.parents or not path.is_file():
            raise ValueError(f"missing figure: {name}")
    return list(dict.fromkeys(paths))


def valid_question(row):
    letters = {o.get("letter") for o in row.get("options", [])}
    return (len(row.get("stem", "")) >= 30
            and len(row.get("explanation", "")) >= 150
            and len(letters) >= 2
            and row.get("answer") in letters
            and isinstance(row.get("fa_page"), int)
            and bool(row.get("chapter")))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", action="append", required=True,
                        help="Reviewed batch manifest; repeat for each batch")
    parser.add_argument("--write", action="store_true",
                        help="Write production JSON after validation (default: dry run)")
    args = parser.parse_args()

    handoff = {row["id"]: row for row in read_json(HANDOFF)}
    proposals = proposal_index()
    bank = read_json(BANK)
    bank_by_id = {row["id"]: row for row in bank}
    manifests = {}
    for path in args.manifest:
        for row in read_json(Path(path)):
            qid = row["id"]
            if qid in manifests:
                raise ValueError(f"duplicate manifest ID: {qid}")
            manifests[qid] = row

    added = updated = 0
    held = []
    for qid, item in manifests.items():
        h = handoff.get(qid)
        if not h:
            raise ValueError(f"not in figure handoff: {qid}")
        if item.get("unresolved"):
            held.append((qid, item["unresolved"]))
            continue
        qimgs = safe_images(item.get("question_images", []))
        eimgs = safe_images(item.get("explanation_images", []))
        q_required = bool(h.get("question_figure_description") or h.get("image_hint_pages") or h.get("kind"))
        e_required = bool(h.get("expl_fig_desc") or h.get("expl_fig_pages")) and not item.get("explanation_figure_not_present")
        if q_required and not qimgs:
            held.append((qid, "required question figure missing"))
            continue
        if e_required and not eimgs:
            held.append((qid, "required explanation figure missing"))
            continue
        if not qimgs and not eimgs:
            held.append((qid, "no figure attached"))
            continue
        if qid in bank_by_id:
            target = bank_by_id[qid]
            if h.get("status") == "LIVE-ATTACH":
                updated += 1
            elif h.get("status") == "NEW-PUBLISH":
                source = proposals.get(qid)
                if not source or target.get("stem") != source.get("stem"):
                    held.append((qid, "new-question ID already exists with a different stem"))
                    continue
                updated += 1  # idempotent rerun after an earlier batch merge
            else:
                held.append((qid, "unknown status in verified queue"))
                continue
        else:
            if h.get("status") != "NEW-PUBLISH":
                held.append((qid, "verified queue expected a live question but ID is absent"))
                continue
            source = proposals.get(qid)
            if not source or not valid_question(source):
                held.append((qid, "missing or invalid text proposal"))
                continue
            target = {k: v for k, v in source.items() if k not in {
                "source_file", "source_pdf", "source_pdf_pages", "question_number",
                "image_hint_pages", "image_status", "image_note",
                "explanation_figure_hint_pages", "explanation_figure_status",
            }}
            target["complete"] = True
            target["reviewed"] = True
            target["review_required"] = False
            bank.append(target)
            bank_by_id[qid] = target
            added += 1
        if qimgs:
            target["question_images"] = qimgs
            target["question_figures_reviewed"] = True
            target["question_figure_description"] = h.get("question_figure_description") or target.get("question_figure_description") or "题目相关图表"
        if eimgs:
            target["explanation_images"] = eimgs
            target["explanation_figures_reviewed"] = True
    print(json.dumps({"handoff_total": len(handoff), "manifest_entries": len(manifests),
                      "added": added, "updated": updated, "held": held},
                     ensure_ascii=False, indent=2))
    if args.write:
        BANK.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
