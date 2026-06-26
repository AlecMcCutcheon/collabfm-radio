#!/usr/bin/env bash
# Sync docs/wiki/*.md to the GitHub Wiki git repository.
# Prerequisite: create any page once on GitHub (Wiki tab → Create first page)
# so github.com/OWNER/REPO.wiki.git exists, then run this script.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/docs/wiki"
TMP="${TMPDIR:-/tmp}/collabfm-radio.wiki-publish"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required." >&2
  exit 1
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
WIKI_URL="https://github.com/${REPO}.wiki.git"
TOKEN="$(gh auth token)"

rm -rf "$TMP"
mkdir -p "$TMP"

if git clone "https://x-access-token:${TOKEN}@${WIKI_URL#https://}" "$TMP" 2>/dev/null; then
  :
else
  echo "Wiki git repo not found. On GitHub: open the Wiki tab and save a placeholder Home page first." >&2
  echo "Then re-run: ./scripts/publish-wiki.sh" >&2
  exit 1
fi

cp "$SRC"/*.md "$TMP/"
# GitHub Wiki links omit .md extensions
for f in "$TMP"/*.md; do
  sed -i 's|\](./\([^)]*\)\.md)|](\1)|g' "$f"
done
cd "$TMP"
git add -A
if git diff --staged --quiet; then
  echo "Wiki already up to date."
  exit 0
fi

git commit -m "Sync wiki from docs/wiki"
git push origin HEAD
echo "Published to https://github.com/${REPO}/wiki"
