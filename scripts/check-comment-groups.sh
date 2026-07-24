#!/usr/bin/env bash
# blocking hook: fails any .ts edit with too many consecutive uncommented lines
# .tsx/JSX is exempt — declarative markup isn't the statement-groups this rule targets
MAX=8

# file path from $1 (opencode plugin) or from hook stdin json (claude code, requires jq)
file="${1:-}"
if [[ -z "$file" ]]; then
  # stdin mode needs jq to read the path: fail loud, never fail open on a missing gate
  command -v jq >/dev/null 2>&1 || { echo "comment-groups: jq required for hook mode (brew install jq)" >&2; exit 2; }
  file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
fi
[[ "$file" == *.ts ]] || exit 0
[[ -f "$file" ]] || exit 0

# measure the longest run of statement lines with no comment between them. a statement line is one that
# stands on its own, not a continuation of a multi-line thing:
# - a line ending in a comma is a property, element, or argument inside a multi-line literal or call, not a statement
# - a wrapped import's specifier lines are one statement, so they are not counted
# - a block comment or jsdoc is documentation, so none of its lines are counted either
run=0
max_run=0
in_import=0
in_block_comment=0
while IFS= read -r line; do
  trimmed="${line#"${line%%[![:space:]]*}"}"
  # inside a block comment or jsdoc. skip its body lines until the closing */
  if (( in_block_comment )); then
    run=0
    case "$trimmed" in *"*/"*) in_block_comment=0 ;; esac
    continue
  fi
  # inside a wrapped import. skip its specifier lines until the closing `} from ...`
  if (( in_import )); then
    run=0
    case "$trimmed" in *"} from "*) in_import=0 ;; esac
    continue
  fi
  case "$trimmed" in
    ""|//*|"{/*"*) run=0 ;;
    # a trailing comma means this line continues a multi-line literal or call, so it is not a statement
    *,) run=0 ;;
    /\**)
      # a block comment or jsdoc opener. a one-line /* ... */ closes here, otherwise the block continues
      run=0
      case "$trimmed" in *"*/"*) ;; *) in_block_comment=1 ;; esac
      ;;
    import\ *)
      run=0
      # an opening brace with no `from` yet starts a multi-line import
      case "$trimmed" in
        *" from "*) ;;
        *"{"*) in_import=1 ;;
      esac
      ;;
    *) run=$((run+1)); (( run > max_run )) && max_run=$run ;;
  esac
done < "$file"

# block and explain when the run exceeds the limit
if (( max_run > MAX )); then
  echo "comment-groups: $file has $max_run consecutive uncommented lines (limit $MAX). Add a single-line // comment above each logical group." >&2
  exit 2
fi