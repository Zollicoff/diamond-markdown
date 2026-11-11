#!/usr/bin/env python3
"""Report Cargo.lock packages published more recently than a cooling-off period.

A release that is only days old has had little time for a bad publish to be
noticed and yanked. This lists every locked crates.io package younger than the
cutoff, with the newest older version to pin to instead.

    python3 scripts/release-age.py            # 14-day cutoff
    python3 scripts/release-age.py --days 7
    python3 scripts/release-age.py --pin      # also pin them in Cargo.lock

`--pin` runs `cargo update --precise` for each one, repeating while it makes
progress, because some packages can only move after the ones that require
them have moved. Anything it cannot pin is listed at the end.

Cargo has a built-in setting for this (`registry.min-publish-age`), but it is
still nightly-only as of Rust 1.99. Replace this script with it once stable.

Results are cached in target/release-age-cache.json, since a version's publish
date never changes. Requests are spaced one second apart, as crates.io asks.
"""

import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys
import time
import tomllib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "target" / "release-age-cache.json"
AGENT = "diamond-markdown release-age check (https://github.com/Zollicoff/diamond-markdown)"


def published(name, cache):
    """Returns {version: iso_date} for every non-yanked version of a crate."""
    if name not in cache:
        request = urllib.request.Request(
            f"https://crates.io/api/v1/crates/{name}/versions", headers={"User-Agent": AGENT}
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            versions = json.load(response)["versions"]
        cache[name] = {v["num"]: v["created_at"] for v in versions if not v["yanked"]}
        time.sleep(1)
    return cache[name]


def numbers(version):
    """The numeric (major, minor, patch) of a version, ignoring build metadata."""
    core = version.split("+")[0].split("-")[0]
    return tuple(int(part) for part in core.split("."))


def compatible(candidate, locked):
    """Whether Cargo treats `candidate` as a drop-in for `locked` (caret rules)."""
    a, b = numbers(candidate), numbers(locked)
    if b[0] > 0:
        return a[0] == b[0]
    if b[1] > 0:
        return a[:2] == b[:2]
    return a == b


def scan(days, cache):
    """Returns (package count, [(name, version, published, fallback)])."""
    lock = tomllib.loads((ROOT / "Cargo.lock").read_text())
    packages = sorted(
        {(p["name"], p["version"]) for p in lock["package"] if p.get("source", "").startswith("registry+")}
    )
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)

    too_new = []
    for position, (name, version) in enumerate(packages, 1):
        try:
            dates = published(name, cache)
        except Exception as error:  # network failure: report and keep going
            print(f"  could not check {name}: {error}", file=sys.stderr)
            continue
        if position % 50 == 0:
            CACHE.parent.mkdir(exist_ok=True)
            CACHE.write_text(json.dumps(cache))
        when = dates.get(version)
        if when is None:
            too_new.append((name, version, "yanked or missing", None))
            continue
        if dt.datetime.fromisoformat(when) > cutoff:
            older = [
                v
                for v, d in dates.items()
                # A `-` before any `+` marks a pre-release; after it, it is
                # only build metadata such as `1.2.0+spec-1.1.0`.
                if dt.datetime.fromisoformat(d) <= cutoff
                and "-" not in v.split("+")[0]
                and compatible(v, version)
            ]
            fallback = max(older, key=numbers) if older else None
            too_new.append((name, version, when[:10], fallback))

    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache))
    return len(packages), too_new


def pin(too_new):
    """Tries to pin each package once. Returns how many it moved."""
    moved = 0
    for name, version, _, fallback in too_new:
        if fallback is None:
            continue
        result = subprocess.run(
            ["cargo", "update", "--quiet", "-p", f"{name}@{version}", "--precise", fallback],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            moved += 1
            print(f"  pinned {name} {version} -> {fallback}")
    return moved


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--pin", action="store_true", help="pin too-new packages in Cargo.lock")
    args = parser.parse_args()
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}

    total, too_new = scan(args.days, cache)
    while args.pin and too_new and pin(too_new):
        total, too_new = scan(args.days, cache)

    print(f"{total} locked crates.io packages, {len(too_new)} newer than {args.days} days")
    for name, version, when, fallback in too_new:
        hint = f"newest compatible older release: {fallback}" if fallback else "no compatible older release"
        print(f"  {name} {version}  published {when}  ({hint})")
    return 1 if too_new else 0


if __name__ == "__main__":
    sys.exit(main())
