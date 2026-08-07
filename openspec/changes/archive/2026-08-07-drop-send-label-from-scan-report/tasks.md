## 1. Drop the verdict label, keep the judgment

- [x] 1.1 Reword the closing beat in `worker/prompts/summarize-topic-scan.md` to ask for a plain sentence on whether the scan answered what the reader asked, including when it did not
- [x] 1.2 Forbid the shape as well as the words, so the model cannot swap in another verdict label followed by a dash
- [x] 1.3 Bump the prompt's `version` from 6 to 7 with a current `updated` date
- [x] 1.4 Confirm nothing reads the removed label: `suppress` appears nowhere outside the prompt, and `worker/notify.ts` still decides dispatch by email subscribers alone

## 2. Verify

- [x] 2.1 `bash scripts/preflight.sh` is green
- [x] 2.2 Generate a report through the real model from the bundled template and confirm it closes with a plain judgment and no verdict label
- [x] 2.3 Generate one for a scan that answered poorly and confirm the closing line says so rather than going missing
- [x] 2.4 Diff the registry's served template against the bundled one and confirm a sync would overwrite no hand-tuned wording

## 3. Deploy

- [x] 3.1 `bun run prompts:sync` so dev serves the new version, since a registry template wins over the bundled one. Confirmed: dev serves v10 with no send label
- [x] 3.2 Record that production needs its own sync, since `prompts:sync:prd` can only run once the release workflow has deployed this code

Production still serves the old wording until `bun run prompts:sync:prd` runs after the deploy. Until then the registry's template wins over the bundled one and reports keep their send label, which is a stale prompt version rather than a broken one.
