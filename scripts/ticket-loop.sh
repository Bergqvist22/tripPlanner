#!/usr/bin/env bash
# Implements the ready tickets one after another, each in a fresh Claude
# session so no context carries over from one ticket to the next.
#
# Each round: pick the lowest-numbered open `ready-for-agent` issue whose
# blockers are all closed, run /mattpocock-skills:implement on it headlessly,
# check that the session committed and closed the issue, then push.
#
# Stops when no ticket is ready, or as soon as a round does not end with a
# closed issue and a clean tree, so a stuck ticket is never retried blindly.
#
# Usage: scripts/ticket-loop.sh [max-tickets]
#   PERMISSION_MODE  permission mode for the sessions (default: auto)
#   CLAUDE_ARGS      extra arguments for `claude`, e.g. "--model opus"

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

max_tickets="${1:-0}"
permission_mode="${PERMISSION_MODE:-auto}"
log_dir="$(git rev-parse --git-dir)/ticket-loop"
mkdir -p "$log_dir"

for tool in claude gh jq bc; do
  command -v "$tool" >/dev/null || { echo "ticket-loop: $tool is not installed" >&2; exit 1; }
done

repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

stop() {
  echo "ticket-loop: $*" >&2
  exit 1
}

# Prints the number of the next ticket to implement, or nothing if none is ready.
next_ticket() {
  local number
  for number in $(gh issue list --state open --label ready-for-agent --limit 200 \
    --json number --jq 'map(.number) | sort | .[]'); do
    local open_blockers
    open_blockers="$(gh api --paginate "repos/$repo/issues/$number/dependencies/blocked_by" \
      --jq 'map(select(.state == "open")) | length' | paste -sd+ | bc)"
    if [ "${open_blockers:-0}" -eq 0 ]; then
      echo "$number"
      return
    fi
  done
}

done_count=0
while :; do
  [ -z "$(git status --porcelain)" ] || stop "the working tree is not clean; commit or stash first"

  issue="$(next_ticket)"
  if [ -z "$issue" ]; then
    echo "ticket-loop: no ready tickets left, $done_count implemented"
    exit 0
  fi

  title="$(gh issue view "$issue" --json title --jq .title)"
  log="$log_dir/issue-$issue-$(date +%Y%m%dT%H%M%S).jsonl"
  before="$(git rev-parse HEAD)"
  echo
  echo "=== #$issue $title ==="
  echo "    log: $log"

  prompt="/mattpocock-skills:implement GitHub issue #$issue ($title). Read it with \`gh issue view $issue\`, and its parent spec where the ticket points to it.

You are running unattended in a loop, so nobody can answer questions: make the sensible call yourself and record it in the issue comment. Commit to the current branch and do not push; the loop pushes for you. Once committed, close issue #$issue with the usual \"Built in <sha>\" summary comment. If you cannot finish the ticket, leave nothing uncommitted, leave the issue open and comment on it with what blocked you."

  # shellcheck disable=SC2086
  claude --print "$prompt" \
    --permission-mode "$permission_mode" \
    --output-format stream-json --verbose \
    ${CLAUDE_ARGS:-} \
    | tee "$log" \
    | jq --unbuffered -rj '
        if .type == "assistant" then
          .message.content[]
          | if .type == "text" then .text + "\n"
            elif .type == "tool_use" then "  > " + .name + "\n"
            else empty end
        else empty end' \
    || stop "the Claude session for #$issue failed; see $log"

  [ -z "$(git status --porcelain)" ] || stop "#$issue left uncommitted changes; see $log"
  [ "$(git rev-parse HEAD)" != "$before" ] || stop "#$issue produced no commit; see $log"
  [ "$(gh issue view "$issue" --json state --jq .state)" = "CLOSED" ] \
    || stop "#$issue is still open; read its comments and $log"

  git push origin HEAD
  done_count=$((done_count + 1))
  echo "=== #$issue pushed ==="

  if [ "$max_tickets" -gt 0 ] && [ "$done_count" -ge "$max_tickets" ]; then
    echo "ticket-loop: reached the limit of $max_tickets"
    exit 0
  fi
done
