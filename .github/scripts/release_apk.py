#!/usr/bin/env python3
"""Outage-proof GitHub release publisher.

Uploads the built APK to a release (creating one if needed), retrying every
step so transient GitHub 5xx errors (like the 2026-07-20 Actions incident)
do not fail the whole workflow.
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

GH = "https://api.github.com"
TOKEN = os.environ["GH_TOKEN"]
APK_PATH = os.environ["APK_PATH"]
TAG_BASE = os.environ.get("TAG_BASE", "flutter-apk")
RELEASE_NAME = os.environ.get("RELEASE_NAME", "App APK")
REPO = os.environ["GITHUB_REPOSITORY"]
RUN_NUMBER = os.environ.get("GITHUB_RUN_NUMBER", "0")


def api(path, method="GET", data=None, raw=None, ctype="application/json", retries=8):
    url = path if path.startswith("http") else GH + path
    for attempt in range(retries):
        try:
            body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
            req = urllib.request.Request(url, data=body, method=method)
            req.add_header("Authorization", f"Bearer {TOKEN}")
            req.add_header("Accept", "application/vnd.github+json")
            req.add_header("User-Agent", "apk-release-bot")
            if body is not None:
                req.add_header("Content-Type", ctype)
            with urllib.request.urlopen(req, timeout=60) as r:
                payload = r.read()
                return r.status, (json.loads(payload) if payload else {})
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "ignore")[:300]
            if e.code in (404,) or attempt == retries - 1:
                print(f"HTTP {e.code} on {method} {url}: {detail}")
                if attempt == retries - 1:
                    raise
            print(f"  retry {attempt + 1}/{retries} after HTTP {e.code} ({method} {url})")
        except Exception as e:
            print(f"  retry {attempt + 1}/{retries} after {e} ({method} {url})")
            if attempt == retries - 1:
                raise
        time.sleep(10 + attempt * 10)
    raise RuntimeError("unreachable")


def delete_if_exists(tag):
    """If a release for this tag exists (e.g. orphan from a failed run), remove it + the git ref."""
    try:
        _, rel = api(f"/repos/{REPO}/releases/tags/{tag}", retries=2)
    except Exception:
        return  # not found
    rid = rel["id"]
    print(f"tag {tag} already exists (release {rid}) - removing before recreate")
    try:
        api(f"/repos/{REPO}/releases/{rid}", "DELETE", retries=4)
    except Exception as e:
        print("release delete warn:", e)
    try:
        api(f"/repos/{REPO}/git/refs/tags/{tag}", "DELETE", retries=4)
    except Exception as e:
        print("tag ref delete warn:", e)


def main():
    tag = f"{TAG_BASE}-{RUN_NUMBER}"
    delete_if_exists(tag)
    print(f"Creating release {RELEASE_NAME} (build {RUN_NUMBER}) as tag {tag}")

    body = {
        "name": f"{RELEASE_NAME} (build {RUN_NUMBER})",
        "body": "🎮 Auto-built APK. Install: allow 'Install unknown apps' on Android, then open the file.\n"
                "The app shows the live game — every website update arrives instantly.",
        "draft": False,
        "prerelease": False,
    }
    try:
        b = dict(body)
        b["tag_name"] = tag
        status, release = api(f"/repos/{REPO}/releases", "POST", data=b, retries=3)
    except Exception as e:
        # Outage/leftover collision: fall back to a unique timestamped tag.
        tag = f"{TAG_BASE}-{RUN_NUMBER}-{int(time.time())}"
        print("create failed, falling back to unique tag", tag, "| cause:", e)
        b = dict(body)
        b["tag_name"] = tag
        status, release = api(f"/repos/{REPO}/releases", "POST", data=b)
    rel_id = release["id"]
    print("release id:", rel_id)

    with open(APK_PATH, "rb") as f:
        apk_bytes = f.read()
    size_mb = len(apk_bytes) / 1e6
    print(f"uploading asset app-debug.apk ({size_mb:.1f} MB)")

    # resolve upload host
    upload_url = release["upload_url"].split("{")[0] + "?name=app-debug.apk"
    for attempt in range(6):
        try:
            req = urllib.request.Request(upload_url, data=apk_bytes, method="POST")
            req.add_header("Authorization", f"Bearer {TOKEN}")
            req.add_header("Accept", "application/vnd.github+json")
            req.add_header("Content-Type", "application/vnd.android.package-archive")
            req.add_header("User-Agent", "apk-release-bot")
            with urllib.request.urlopen(req, timeout=600) as r:
                asset = json.loads(r.read())
            print("asset url:", asset["browser_download_url"])
            return
        except Exception as e:
            print(f"  asset upload retry {attempt + 1}/6 after {e}")
            time.sleep(15 + attempt * 15)
    raise RuntimeError("asset upload failed after retries")


if __name__ == "__main__":
    main()
