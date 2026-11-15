#!/usr/bin/env python3
"""Rebuild task_tracker/index.html from docs/BACKLOG.md and task_tracker/changes.json.

    python3 task_tracker/build.py

docs/BACKLOG.md is the source of truth. This script only replaces the JSON data
block inside index.html; the page itself (markup, styles, script) is edited by
hand. The output is deterministic, so running it with nothing changed leaves
the file untouched.
"""
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
BACKLOG = HERE.parent / "docs" / "BACKLOG.md"
PAGE = HERE / "index.html"
CHANGES = HERE / "changes.json"

STATUS = {"Open": "open", "In progress": "in_progress", "Done": "done", "Won't fix": "wont_fix"}
DATE = r"\d{4}-\d{2}-\d{2}"


def parse_backlog(text):
    issues = []
    for section in re.split(r"^### ", text, flags=re.M)[1:]:
        section = re.split(r"^(?:## |---$)", section, flags=re.M)[0]  # stop at the next heading or rule
        head, _, body = section.partition("\n")
        m = re.match(r"(SYN-\d{3}) · (.+)", head.strip())
        meta = re.search(rf"\*\*(P[0-3])\*\* · (.+?) · (.+?) · Status: \*\*(.+?)\*\*.*? · Found ({DATE})", body)
        assert m and meta, f"unparsed section: {head!r}"

        def field(name):
            found = re.search(rf"- \*\*{name}:\*\* (.+)", body)
            return found[1].strip() if found else ""

        pr = re.search(r"https://github\.com/\S+?/pull/\d+", body)
        issues.append({
            "id": m[1], "num": int(m[1][4:]), "title": m[2].strip(),
            "priority": meta[1], "area": meta[2], "type": meta[3], "status": STATUS[meta[4]],
            "found": meta[5],
            # Last touched = the latest date mentioned anywhere in the section.
            "updated": max(re.findall(DATE, body)),
            "problem": field("Problem"), "where": field("Where"), "done_when": field("Done when"),
            "pr": pr[0] if pr else "", "source": field("Source"),
        })

    ids = [i["id"] for i in issues]
    assert len(ids) == len(set(ids)), "issue IDs must be unique"
    assert [i["priority"] for i in issues] == sorted(i["priority"] for i in issues), "sections must be grouped by priority"
    assert re.findall(r"^\| (SYN-\d{3}) \|", text, flags=re.M) == ids, "summary table and sections disagree"
    return issues


def main():
    issues = parse_backlog(BACKLOG.read_text())
    changes = sorted(json.loads(CHANGES.read_text()), key=lambda c: c["at"], reverse=True)
    data = {"updated": max(i["updated"] for i in issues), "issues": issues, "changes": changes}
    # "</" must not appear inside a <script> block.
    blob = json.dumps(data, ensure_ascii=False, indent=1).replace("</", "<\\/")

    page = PAGE.read_text()
    block = re.compile(r'(<script id="data" type="application/json">\n).*?(\n</script>)', re.S)
    assert len(block.findall(page)) == 1, "index.html must contain exactly one data block"
    PAGE.write_text(block.sub(lambda mo: mo[1] + blob + mo[2], page))

    by_pri = {p: sum(i["priority"] == p for i in issues) for p in ("P0", "P1", "P2", "P3")}
    done = sum(i["status"] in ("done", "wont_fix") for i in issues)
    print(f"{len(issues)} issues {by_pri}, {done} resolved, {len(changes)} changes -> {PAGE.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
