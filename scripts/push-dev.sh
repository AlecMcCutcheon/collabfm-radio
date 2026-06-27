#!/usr/bin/env bash
# Push the current work to the develop branch and publish GHCR :dev (not :latest).
#
# Usage:
#   ./scripts/push-dev.sh                    # push existing commits only
#   ./scripts/push-dev.sh "fix metadata bug"   # commit all changes, then push
#
# Your homelab instance can track:
#   ghcr.io/alecmccutcheon/collabfm-radio:dev
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! git remote get-url origin &>/dev/null; then
  echo "error: no git remote 'origin'" >&2
  exit 1
fi

COMMIT_MSG="${1:-}"
CURRENT_BRANCH="$(git branch --show-current)"

if [[ -n "$COMMIT_MSG" ]]; then
  if ! git config user.email &>/dev/null || ! git config user.name &>/dev/null; then
    echo "error: git author not configured (needed to commit)" >&2
    echo "" >&2
    echo "Run once in this repo (matches your GitHub commits):" >&2
    echo '  git config user.name "AlecMcCutcheon"' >&2
    echo '  git config user.email "alecmccutcheon@users.noreply.github.com"' >&2
    echo "" >&2
    echo "Or use --global instead of repo-only if you prefer." >&2
    exit 1
  fi
  git add -A
  if ! git diff --staged --quiet; then
    git commit -m "$COMMIT_MSG"
  else
    echo "nothing to commit"
  fi
fi

git fetch origin

if git show-ref --verify --quiet refs/remotes/origin/develop; then
  if [[ "$CURRENT_BRANCH" != "develop" ]]; then
    git checkout develop
    git pull --ff-only origin develop
    git merge "$CURRENT_BRANCH" --no-edit
  else
    git pull --ff-only origin develop
  fi
else
  if [[ "$CURRENT_BRANCH" != "develop" ]]; then
    git checkout -b develop "$CURRENT_BRANCH"
  fi
fi

git push -u origin develop

if [[ "$CURRENT_BRANCH" != "develop" ]] && git show-ref --verify --quiet "refs/heads/${CURRENT_BRANCH}"; then
  git checkout "$CURRENT_BRANCH"
fi

echo ""
echo "Pushed to origin/develop."
echo "GHCR will build: ghcr.io/$(git remote get-url origin | sed -E 's#.*[:/]([^/]+/[^/.]+)(\.git)?$#\1#' | tr '[:upper:]' '[:lower:]'):dev"
echo "Set IMAGE=...:dev in your compose/.env and recreate the container to test."
