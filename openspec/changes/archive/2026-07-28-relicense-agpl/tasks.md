## 1. License declarations

- [x] 1.1 Replace `LICENSE`'s full text with the complete, unmodified AGPL-3.0 text (canonical source: `gnu.org/licenses/agpl-3.0.txt`)
- [x] 1.2 Add `"license": "AGPL-3.0-only"` to `package.json` (the field does not exist there yet)
- [x] 1.3 Update `README.md`'s `## License` section from `MIT` to `AGPL-3.0-only`

## 2. App copy

- [x] 2.1 Update `Footer.tsx`'s "MIT licensed." line to name AGPL-3.0; leave the existing "Source Code" link as is, it already satisfies the network-use requirement
- [x] 2.2 Update `PrivacyPage.tsx`'s "open source under the MIT license" mention to AGPL-3.0
- [x] 2.3 Update `TermsPage.tsx`'s two MIT mentions ("released under the MIT license... MIT license governs the code" and "the MIT license permits") to AGPL-3.0

## 3. Verification

- [x] 3.1 Grep the repo for remaining product-facing "MIT" mentions (excluding vendored skill frontmatter under `.claude/skills/`, `.agents/skills/`, `.opencode/skills/`, and archived `openspec/changes/archive/` history) to confirm none were missed
- [x] 3.2 Run the full verification gate: `scripts/check-comment-groups.sh`, `bunx biome check . --diagnostic-level=error`, `bunx tsc -b`, `bun test`
- [x] 3.3 Visually confirm the footer, Privacy page, and Terms page in the browser
