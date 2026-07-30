## Why

CarlNotes is solo-authored today, so relicensing needs no contributor sign-off — the moment that stops being true. MIT lets anyone host a modified CarlNotes as a paid service without ever sharing their changes back. AGPL-3.0 closes that gap by requiring source availability for network use, not just distribution.

## What Changes

- Replace `LICENSE`'s full text: MIT → the complete AGPL-3.0 text.
- Add `"license": "AGPL-3.0-only"` to `package.json` (the field does not exist there today — this is a new field, not an edit to an existing value). **BREAKING** for any tooling or license scanner that currently reads this package as unlicensed or assumes MIT from context.
- Update `README.md`'s `## License` section from `MIT` to `AGPL-3.0-only`.
- Update the footer's "MIT licensed." line to name AGPL-3.0 instead. The footer's existing "Source Code" link (already present, pointing at the GitHub repo) is what satisfies AGPL's network-use source-availability requirement — no new link needs to be added.
- Correct `PrivacyPage.tsx` and `TermsPage.tsx`, which today explicitly name "the MIT license" in their body copy (three mentions across the two pages). These were believed to already name AGPL; they don't, and left alone they'd misstate the license the day this ships.
- No contributor sign-off process: the repository has one author, so there is no third-party copyright to clear.

## Capabilities

### New Capabilities
- `licensing`: the project's declared license — `LICENSE`, `package.json`, `README.md` — and every user-facing surface that names it (footer, Privacy page, Terms page) agree with each other.

### Modified Capabilities
(none — no existing spec capability covers licensing today)

## Impact

- Affected files: `LICENSE`, `package.json`, `README.md`, `ui/src/components/Footer.tsx`, `ui/src/pages/PrivacyPage.tsx`, `ui/src/pages/TermsPage.tsx`.
- No code behavior, schema, API, or dependency changes — this is copy and metadata only.
- External impact: redistributors and anyone running CarlNotes as a network service must comply with AGPL-3.0's source-availability terms going forward; MIT's permissive terms no longer apply to versions released after this change lands.
