#!/usr/bin/env bash
set -euo pipefail

repo="quhongli123/llmpro-release"
source_repo="quhongli123/llmpro"
tag="${1:-}"
macos_runner="${MACOS_RUNNER:-macos-15}"

usage() {
  printf 'Usage: %s v0.2.164\n' "$0" >&2
  printf 'Optional: MACOS_RUNNER=macos-15-intel %s v0.2.164\n' "$0" >&2
  exit 2
}

[[ -n "$tag" ]] || usage
if [[ ! "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  printf 'Invalid stable tag: %s\n' "$tag" >&2
  usage
fi
case "$macos_runner" in
  macos-15|macos-15-intel) ;;
  *)
    printf 'Invalid MACOS_RUNNER: %s\n' "$macos_runner" >&2
    exit 2
    ;;
esac

command -v gh >/dev/null || {
  printf 'gh is required.\n' >&2
  exit 1
}
gh auth status >/dev/null

gh api "repos/$source_repo/git/ref/tags/$tag" >/dev/null

dispatch_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run prepare-release.yml \
  --repo "$repo" \
  --ref main \
  -f source_ref="$tag" \
  -f macos_runner="$macos_runner" \
  -f publish_after_build=true

run_id=""
for _ in {1..20}; do
  sleep 2
  run_id="$(gh run list \
    --repo "$repo" \
    --workflow prepare-release.yml \
    --limit 20 \
    --json databaseId,createdAt,displayTitle | \
    jq -r --arg since "$dispatch_time" --arg tag "$tag" '
      map(select(.createdAt >= $since and (.displayTitle | contains($tag))))
      | sort_by(.createdAt)
      | reverse
      | .[0].databaseId // empty
    ')"
  [[ -n "$run_id" ]] && break
done
if [[ -z "$run_id" ]]; then
  printf 'prepare-release 已触发，但未找到对应 run；请打开 https://github.com/%s/actions/workflows/prepare-release.yml 查看。\n' "$repo" >&2
  exit 1
fi

printf 'prepare-release: https://github.com/%s/actions/runs/%s\n' "$repo" "$run_id"
gh run watch "$run_id" --repo "$repo" --exit-status

release_run_id=""
for _ in {1..30}; do
  release_run_id="$(gh run list \
    --repo "$repo" \
    --workflow release.yml \
    --event workflow_run \
    --limit 30 \
    --json databaseId,createdAt,displayTitle | \
    jq -r --arg since "$dispatch_time" --arg tag "$tag" '
      map(select(.createdAt >= $since and (.displayTitle | contains($tag))))
      | sort_by(.createdAt)
      | reverse
      | .[0].databaseId // empty
    ')"
  [[ -n "$release_run_id" ]] && break
  sleep 2
done

if [[ -z "$release_run_id" ]]; then
  printf '签名发布没有自动出现；请打开 https://github.com/%s/actions/workflows/release.yml 查看。\n' "$repo" >&2
  exit 1
fi

printf 'release: https://github.com/%s/actions/runs/%s\n' "$repo" "$release_run_id"
gh run watch "$release_run_id" --repo "$repo" --exit-status
printf '公开版本: https://github.com/%s/releases/tag/%s\n' "$repo" "$tag"
