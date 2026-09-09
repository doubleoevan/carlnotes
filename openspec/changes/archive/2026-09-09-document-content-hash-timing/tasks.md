## 1. The requirement says when the hash is taken

- [x] 1.1 State in the content-hash requirement that the dedupe stage takes the hash, that the fetch stage may replace a url-read title afterward, and that the fetch leaves the hash as written
- [x] 1.2 State that the re-review selector depends on the hash being left alone, so refreshing it on a retitle would send every retitled Resource back through paid scoring
- [x] 1.3 Add a scenario for a retitled Resource keeping the hash it was deduped under

## 2. Verification

- [x] 2.1 Run `openspec validate document-content-hash-timing`
- [x] 2.2 Confirm the requirement matches the code: the hash is written in `dedupeResource` in `worker/review/filter.ts`, `toContentHash` has no call site in `worker/review/score.ts`, and `loadResourcesToReview` compares the Finding's hash against the Resource's
