#!/usr/bin/env python3
"""Doc invariants for VolunteersManager.

Single source of truth for "is the documentation set internally consistent?"
Invoked locally, from CI, and from the Claude Stop hook via check.sh.

Exit codes:
    0  all checks pass
    1  one or more failures (details printed to stderr)
    2  internal error (bug in this script)

Add new checks by writing a `check_*` function that yields Failure objects.
Register it in CHECKS at the bottom.
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass
from glob import glob
from pathlib import Path
from typing import Iterable, Iterator

REPO_ROOT = Path(__file__).resolve().parents[2]
DOCS = REPO_ROOT / "docs"
MILESTONES = DOCS / "milestones"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Decisions locked during pre-implementation grilling. The string in column 1
# must not appear in milestone files (and in some cases must not appear in
# code, once code exists). Allowlisted contexts are documented per pattern.
FORBIDDEN_IN_MILESTONES: list[tuple[str, str, list[str]]] = [
    # (pattern, human reason, list of allowed contexts that prevent a flag)
    (
        r"\bchromedp\b",
        "PDF stack is maroto v2 (locked); chromedp must not appear in milestones",
        [
            # Legitimate mentions: explicit "not using" statements or historical comparisons.
            "no chromedp",
            "we use no chromedp",
            "before reconsidering",
            "old chromedp design",
            "the chromedp pipeline described",
            "trade-off vs",
        ],
    ),
    (
        r"\bheadless\s+Chrome\b",
        "PDF stack is pure-Go (locked); headless Chrome must not appear in milestones",
        [],
    ),
    (
        r"\bevent_id\b",
        "Single event per SQLite file (locked); event_id columns must not appear",
        [
            # The locked-decisions README and milestone notes explicitly call out
            # that event_id was removed. Those mentions are the antidote, not a
            # leak.
            "event_id removed",
            "event_id dropped",
            "event_id column dropped",
            "no event_id",
            "without event_id",
            # The locked-decisions index says "No `event_id` everywhere."
            "no event_id everywhere",
        ],
    ),
    (
        r"\bORS\s*/\s*OSRM\b|\bOpenRouteService\b",
        "Routing is haversine-only in v1; ORS/OSRM is forward-looking only",
        [
            # Milestones may reference these as forward-looking — flagged when
            # phrased as if v1 uses them.
            "forward-looking",
            "later ORS/OSRM",
            "future ORS",
            "later for",
            "not used in v1",
            "explicitly not built in v1",
            "explicitly **not** built in v1",
            "defer",  # matches "defer", "deferred", "deferral"
            "locked decision",
            "out of scope",
        ],
    ),
]

REQUIRED_BANNER_RE = re.compile(
    r"^>\s*(?:⚠️|ℹ️)\s+\*\*(?:Partially|Substantially|Mostly)\b",
    re.MULTILINE,
)
REQUIRED_BANNER_DOCS = [
    "01-vision.md",
    "02-spec.md",
    "03-architecture.md",
    "04-design.md",
    "05-data-model.md",
    "06-out-of-scope.md",
    "07-open-questions.md",
]

MIGRATION_PATTERN = re.compile(r"`(\d{4})_([a-z][a-z0-9_]*)\.sql`")

LINK_PATTERN = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


# ---------------------------------------------------------------------------
# Failure plumbing
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Failure:
    check: str
    file: str
    detail: str
    line: int | None = None

    def render(self) -> str:
        loc = f"{self.file}" + (f":{self.line}" if self.line else "")
        return f"  [{self.check}] {loc} — {self.detail}"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _line_of(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


def check_links() -> Iterator[Failure]:
    """All intra-repo relative links resolve."""
    targets: list[Path] = []
    targets.extend(sorted(DOCS.glob("*.md")))
    targets.extend(sorted(MILESTONES.glob("*.md")))
    for path in targets:
        if not path.exists():
            continue
        content = _read(path)
        for m in LINK_PATTERN.finditer(content):
            link = m.group(1).strip()
            if link.startswith(("http://", "https://", "mailto:", "#")):
                continue
            link = link.split("#")[0]
            if not link:
                continue
            resolved = (path.parent / link).resolve()
            if not resolved.exists():
                yield Failure(
                    check="links",
                    file=str(path.relative_to(REPO_ROOT)),
                    line=_line_of(content, m.start()),
                    detail=f"broken link → {link}",
                )


def check_supersession_banners() -> Iterator[Failure]:
    """docs/01..07 must each open with a supersession banner."""
    for name in REQUIRED_BANNER_DOCS:
        path = DOCS / name
        if not path.exists():
            yield Failure(
                check="banners",
                file=f"docs/{name}",
                detail="file missing — cannot verify banner",
            )
            continue
        head = "\n".join(_read(path).splitlines()[:8])
        if not REQUIRED_BANNER_RE.search(head):
            yield Failure(
                check="banners",
                file=f"docs/{name}",
                detail=(
                    "missing supersession banner in first 8 lines "
                    "(expected '> ⚠️ **Partially superseded.**' or similar)"
                ),
            )


def _strip_markdown_formatting(s: str) -> str:
    """Remove inline markdown noise so allowlist substrings don't have to
    anticipate every backtick/asterisk variant."""
    # Drop backticks and asterisks; collapse runs of whitespace.
    cleaned = re.sub(r"[`*_]", "", s)
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def check_forbidden_patterns() -> Iterator[Failure]:
    """Forbidden tokens must not leak back into milestone docs."""
    if not MILESTONES.exists():
        return
    for path in sorted(MILESTONES.glob("*.md")):
        content = _read(path)
        for pattern, reason, allowed in FORBIDDEN_IN_MILESTONES:
            regex = re.compile(pattern, re.IGNORECASE)
            for m in regex.finditer(content):
                line_no = _line_of(content, m.start())
                line_text = content.splitlines()[line_no - 1]
                cleaned_line = _strip_markdown_formatting(line_text)
                if any(_strip_markdown_formatting(a) in cleaned_line for a in allowed):
                    continue
                yield Failure(
                    check="forbidden",
                    file=str(path.relative_to(REPO_ROOT)),
                    line=line_no,
                    detail=f"{m.group(0)!r} — {reason}",
                )


def check_migration_sequence() -> Iterator[Failure]:
    """Migration filenames referenced across milestones form a contiguous
    sequence starting at 0001."""
    if not MILESTONES.exists():
        return
    found: dict[int, list[tuple[str, int, str]]] = {}
    for path in sorted(MILESTONES.glob("*.md")):
        content = _read(path)
        for m in MIGRATION_PATTERN.finditer(content):
            num = int(m.group(1))
            slug = m.group(2)
            line_no = _line_of(content, m.start())
            found.setdefault(num, []).append(
                (str(path.relative_to(REPO_ROOT)), line_no, slug)
            )

    if not found:
        return

    nums = sorted(found)
    if nums[0] != 1:
        yield Failure(
            check="migrations",
            file="docs/milestones/",
            detail=f"migration sequence does not start at 0001 (first is {nums[0]:04d})",
        )

    # Gaps
    for expected, actual in zip(range(nums[0], nums[-1] + 1), range(nums[0], nums[-1] + 1)):
        if expected not in found:
            yield Failure(
                check="migrations",
                file="docs/milestones/",
                detail=f"missing migration {expected:04d} (gap in 0001…{nums[-1]:04d} sequence)",
            )

    # Slug consistency: each migration number should declare the same slug across files
    for num, occurrences in found.items():
        slugs = {slug for _, _, slug in occurrences}
        if len(slugs) > 1:
            for f, line, slug in occurrences:
                yield Failure(
                    check="migrations",
                    file=f,
                    line=line,
                    detail=(
                        f"migration {num:04d} declared with conflicting slugs "
                        f"across files: {sorted(slugs)}"
                    ),
                )


def check_milestone_index() -> Iterator[Failure]:
    """milestones/README.md must list every milestone file and vice versa."""
    index = MILESTONES / "README.md"
    if not index.exists():
        yield Failure(
            check="index",
            file="docs/milestones/README.md",
            detail="milestone index missing",
        )
        return

    index_text = _read(index)
    files = sorted(p.name for p in MILESTONES.glob("[0-9][0-9]-*.md"))
    for f in files:
        if f"(./{f})" not in index_text:
            yield Failure(
                check="index",
                file="docs/milestones/README.md",
                detail=f"milestone {f} exists but is not linked from the index",
            )

    # Reverse: every link in the index that points to a milestone file
    # must exist (already covered by check_links, but we double-check
    # the index has no dangling milestone entries).


def check_locked_decisions_present() -> Iterator[Failure]:
    """milestones/README.md must contain the Locked Decisions block."""
    index = MILESTONES / "README.md"
    if not index.exists():
        return
    text = _read(index)
    if "Locked decisions" not in text:
        yield Failure(
            check="locked-decisions",
            file="docs/milestones/README.md",
            detail="'Locked decisions' section missing from the milestone index",
        )


def check_acceptance_criteria_present() -> Iterator[Failure]:
    """Every numbered milestone file must contain an 'Acceptance criteria' section."""
    if not MILESTONES.exists():
        return
    for path in sorted(MILESTONES.glob("[0-9][0-9]-*.md")):
        text = _read(path)
        if "Acceptance criteria" not in text:
            yield Failure(
                check="acceptance",
                file=str(path.relative_to(REPO_ROOT)),
                detail="missing 'Acceptance criteria' section",
            )
        elif "- [ ]" not in text and "- [x]" not in text:
            yield Failure(
                check="acceptance",
                file=str(path.relative_to(REPO_ROOT)),
                detail="acceptance criteria found but no checklist items (`- [ ]`)",
            )


def check_harness_state() -> Iterator[Failure]:
    """If .harness/STATE.md exists, the milestones it lists must match
    the ones on disk."""
    state = REPO_ROOT / ".harness" / "STATE.md"
    if not state.exists():
        # State file is optional at the harness's own bootstrap moment.
        return
    state_text = _read(state)
    files = sorted(p.name for p in MILESTONES.glob("[0-9][0-9]-*.md"))
    for f in files:
        slug = f.removesuffix(".md")
        if slug not in state_text:
            yield Failure(
                check="state",
                file=".harness/STATE.md",
                detail=f"milestone {slug} not tracked in STATE.md",
            )


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


CHECKS = [
    ("links", check_links),
    ("supersession-banners", check_supersession_banners),
    ("forbidden-patterns", check_forbidden_patterns),
    ("migration-sequence", check_migration_sequence),
    ("milestone-index", check_milestone_index),
    ("locked-decisions", check_locked_decisions_present),
    ("acceptance-criteria", check_acceptance_criteria_present),
    ("harness-state", check_harness_state),
]


def main(argv: list[str]) -> int:
    only = set(argv[1:]) if argv[1:] else None
    failures: list[Failure] = []
    ran: list[str] = []
    for name, fn in CHECKS:
        if only and name not in only:
            continue
        ran.append(name)
        try:
            failures.extend(fn())
        except Exception as exc:  # pragma: no cover
            print(
                f"INTERNAL ERROR in check {name!r}: {exc}",
                file=sys.stderr,
            )
            return 2

    if failures:
        print(f"❌ lint_docs.py — {len(failures)} failure(s) across {len(ran)} check(s):", file=sys.stderr)
        for f in failures:
            print(f.render(), file=sys.stderr)
        print("", file=sys.stderr)
        print(
            "Fix the issues above. See docs/milestones/README.md for the "
            "binding decisions and HARNESS.md for the linter contract.",
            file=sys.stderr,
        )
        return 1

    print(f"✅ lint_docs.py — {len(ran)} check(s) passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
