#!/usr/bin/env bash
# blocking hook: fails any .ts/.tsx edit with too many consecutive uncommented lines
MAX=8

# file path from $1 (opencode plugin) or from hook stdin json (claude code, requires jq)
file="${1:-}"
if [[ -z "$file" ]]; then
  # stdin mode needs jq to read the path: fail loud, never fail open on a missing gate
  command -v jq >/dev/null 2>&1 || { echo "comment-groups: jq required for hook mode (brew install jq)" >&2; exit 2; }
  file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
fi
[[ "$file" == *.ts || "$file" == *.tsx ]] || exit 0
[[ -f "$file" ]] || exit 0

# measure the longest run of code lines with no comment, blank line, or import between them
run=0
max_run=0
while IFS= read -r line; do
  trimmed="${line#"${line%%[![:space:]]*}"}"
  case "$trimmed" in
    ""|//*|"{/*"*|import\ *) run=0 ;;
    *) run=$((run+1)); (( run > max_run )) && max_run=$run ;;
  esac
done < "$file"

# block and explain when the run exceeds the limit
if (( max_run > MAX )); then
  echo "comment-groups: $file has $max_run consecutive uncommented lines (limit $MAX). Add a single-line // comment above each logical group." >&2
  exit 2
fi