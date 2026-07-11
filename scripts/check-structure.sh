#!/usr/bin/env bash
# blocking hook: the repo has exactly one package.json (.opencode holds the cli's own bundled install, not ours)

# resolve the edited path from $1 (opencode plugin) or hook stdin json (claude code); the count below is repo-wide, this just drains stdin and keeps the harness contract parallel to check-comment-groups.sh
file="${1:-}"
if [[ -z "$file" ]]; then
  # stdin mode needs jq to read the path: fail loud, never fail open on a missing gate
  command -v jq >/dev/null 2>&1 || { echo "structure: jq required for hook mode (brew install jq)" >&2; exit 2; }
  file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
fi

# count package.json files we own: tracked plus not-yet-staged, honoring .gitignore so node_modules and the tool-managed .opencode/package.json stay out
count=$(git ls-files --cached --others --exclude-standard '*package.json' | wc -l | tr -d ' ')

# block when a second one appears
if (( count > 1 )); then
  echo "structure: $count package.json files found. Modular monolith: one package.json, folders separate concerns." >&2
  exit 2
fi