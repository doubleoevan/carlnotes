## 1. The finding list

- [x] 1.1 In `api/seo.ts`, leave `description` out of a `ListItem` in `toFindingListLd` whose relevance explanation is empty, keeping its position, name, and url
- [x] 1.2 Test that an entry with an explanation keeps its description and an entry without one has none, with every entry and position kept

## 2. Verification

- [x] 2.1 Run `bash scripts/preflight.sh`
- [x] 2.2 Render a public topic page on the dev server whose last scan kept a Finding with no explanation, and confirm its JSON-LD entry has no description while the visible page is unchanged
