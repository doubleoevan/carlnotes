#!/usr/bin/env bash
# blocking hook: a package.json lives at the root, in apps/<name>, or in packages/<name>. .opencode holds the cli's own
# bundled install, which .gitignore keeps out. the check is repo-wide, so the edited path the hook passes is not read

# list the package.json files we own, tracked plus not-yet-staged, honoring .gitignore so node_modules and the
# tool-managed .opencode/package.json stay out. keep the ones outside the root and the workspace folders
allowed='^(package\.json|apps/[^/]+/package\.json|packages/[^/]+/package\.json)$'
disallowed_paths=$(git ls-files --cached --others --exclude-standard '*package.json' | grep -Ev "$allowed" || true)

# block when one sits anywhere else, naming each path
if [[ -n "$disallowed_paths" ]]; then
  while IFS= read -r disallowed_path; do
    echo "structure: $disallowed_path is outside a workspace. workspaces: a package.json lives at the root, in apps/<name>, or in packages/<name>" >&2
  done <<< "$disallowed_paths"
  exit 2
fi
