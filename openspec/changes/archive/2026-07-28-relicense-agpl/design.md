## Context

CarlNotes ships under MIT today: a `LICENSE` file, no `license` field in `package.json`, and a `README.md` that says `MIT`. It runs both as a hosted service (carlnotes.com) and as a self-hostable open-source repo — the Privacy and Terms pages already describe both modes. The repository has one author and no outside contributors, so there is no third-party copyright to clear before changing the license terms going forward.

## Goals / Non-Goals

**Goals:**
- Every place the license is declared or described — `LICENSE`, `package.json`, `README.md`, the footer, the Privacy page, the Terms page — names AGPL-3.0 consistently.
- The hosted service satisfies AGPL-3.0 §13's network-use clause: a user interacting with it over a network can find the corresponding source.

**Non-Goals:**
- No change to what CarlNotes does, its APIs, or its data model — copy and metadata only.
- No retroactive relicensing of an already-published release or tag; this applies going forward from this change.
- No CLA or contributor-license process — out of scope while solo-authored.

## Decisions

- **`AGPL-3.0-only`, not `AGPL-3.0-or-later`**: pins the obligation to the version actually being shipped, rather than letting a future recipient opt into a later GNU-authored revision never reviewed here. Matches the SPDX identifier named in the proposal.
- **The existing footer "Source Code" link already satisfies §13 — no new UI element needed**: it is a persistent, visible link to the exact repository on every page. Nothing about how the app is used (no non-web API consumed directly by end users, no separately distributed CLI) creates an access path that bypasses the footer.
- **Privacy and Terms pages are in scope**, correcting the proposal's initial assumption that they already named AGPL. Both currently state "the MIT license" in substantive sentences, not an incidental mention — shipping a relicense while leaving them unchanged would mean the hosted service's own legal pages misstate its license the moment this merges.
- **License text sourced verbatim from the FSF** (`gnu.org/licenses/agpl-3.0.txt`) rather than paraphrased, since a license's enforceability depends on it being the exact, unmodified text.

## Risks / Trade-offs

- Existing MIT-licensed releases or forks stay MIT forever — expected and unavoidable; this change is prospective only.
- Wording could drift across the four copy locations (README, footer, Privacy, Terms) if only some are updated → mitigated by listing all four explicitly in `tasks.md` rather than leaving any as an unstated follow-up.
- A downstream consumer or license scanner that cached "MIT" before this change won't automatically see the update — no mitigation beyond shipping correct metadata now; not a regression this change introduces.
