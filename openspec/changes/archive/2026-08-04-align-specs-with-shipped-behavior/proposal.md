## Why

Four behaviours shipped as bug fixes without their specs following. In each case the deployed spec now describes something the code no longer does, and in two of them the spec as written still permits the exact bug that was fixed:

- **Video findings were being filtered out.** The embed-filter ran one threshold for every Resource kind. A video's description carries far less prose than an article's body, so watch and listen Resources scored lower against the topic context for reasons that had nothing to do with relevance, and were dropped before scoring. The gate is now per-kind, but `curation` still says "the relevance threshold", singular.
- **The homepage and the topic page ordered the same topic differently.** Relevance scores bunch at the top of the scale, so most of a first page ties at 1.0 and the tiebreak is what actually orders it. With no tiebreak the order fell to whatever each query happened to return. `feed-homepage` still describes relevant sort as "by relevance score" with nothing about ties, which is satisfied by both of the two conflicting orders.
- **One page was stored as several Resources.** Links differing only in a trailing slash, a tracking parameter, or a fragment each became their own row. Canonicalization now collapses them, and a titleless search result derives a title rather than rendering as a bare hostname. `source-ingestion` says "canonical URL" in five requirements without ever defining what makes a URL canonical — and the rule that matters most is a carve-out, since folding case on a YouTube channel id or a `youtu.be` path turns a working link into a 404.
- **The bookmark control moved.** It now lives in a Finding's note popover rather than on the row, which carries only the filled mark once bookmarked. `finding-bookmarks` still says every Finding card carries a toggle.

## What Changes

- `curation`: the embed-filter's relevance threshold becomes per Resource kind, with prose-light kinds held to a lower bar so a medium is never mistaken for irrelevance.
- `feed-homepage`: relevant sort gains a defined tiebreak, and the ordering becomes a total one so any two surfaces built from the same Findings agree.
- `source-ingestion`: a new requirement defines canonical URL, including which host paths fold case and which carry exact ids that must not; a second covers deriving a title for a Resource that arrives without one.
- `finding-bookmarks`: the bookmark control's placement is restated to match where it now lives.

No behaviour changes here. This is the specs catching up to code that already shipped and is verified.

## Impact

- Affected specs: `curation`, `feed-homepage`, `source-ingestion`, `finding-bookmarks`
- Affected code: none — `worker/review/filter.ts`, `worker/ingest/normalize.ts`, `worker/ingest/index.ts`, `ui/src/lib/utils.ts`, and `ui/src/components/topic/TopicResource.tsx` already implement all of it
- Out of scope: the near-duplicate embedding threshold in `curation`, which is a separate gate and unchanged; whether the homepage's per-topic Finding cap should match the topic page's fuller list.
