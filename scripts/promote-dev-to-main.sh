#!/usr/bin/env bash
# Merge develop into main and push — publishes GHCR :latest for everyone else.
#
# Usage:
#   ./scripts/promote-dev-to-main.sh           # confirm interactively
#   ./scripts/promote-dev-to-main.sh --yes     # skip confirmation
#
# After promote, develop is fast-forwarded to main so both branches match.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

SKIP_CONFIRM=false
if [[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]]; then
  SKIP_CONFIRM=true
fi

if ! git remote get-url origin &>/dev/null; then
  echo "error: no git remote 'origin'" >&2
  exit 1
fi

git fetch origin

if ! git show-ref --verify --quiet refs/remotes/origin/develop; then
  echo "error: origin/develop does not exist — run ./scripts/push-dev.sh first" >&2
  exit 1
fi

if ! $SKIP_CONFIRM; then
  echo "This will:"
  echo "  1. Merge origin/develop into main"
  echo "  2. Push main → GHCR :latest"
  echo "  3. Fast-forward develop to match main"
  echo ""
  git log --oneline origin/main..origin/develop | head -20
  COUNT="$(git rev-list --count origin/main..origin/develop 2>/dev/null || echo 0)"
  if [[ "$COUNT" -gt 20 ]]; then
    echo "  ... and $((COUNT - 20)) more commit(s)"
  fi
  echo ""
  read -r -p "Promote develop to main? [y/N] " REPLY
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo "aborted"
    exit 1
  fi
fi

CURRENT_BRANCH="$(git branch --show-current)"
git checkout main
git pull --ff-only origin main
git merge origin/develop --no-edit
git push origin main

git checkout develop
git pull --ff-only origin develop
git merge main --ff-only
git push origin develop

if [[ "$CURRENT_BRANCH" != "develop" ]] && git show-ref --verify --quiet "refs/heads/${CURRENT_BRANCH}"; then
  git checkout "$CURRENT_BRANCH"
fi

echo ""
echo "Promoted develop → main."
echo "GHCR :latest will rebuild shortly. :dev now matches the same commit."
