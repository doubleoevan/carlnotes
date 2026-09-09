## 1. The page's title reaches the Resource

- [x] 1.1 Add `isTitleFromUrlFallback(title, url)` to `worker/ingest/normalize.ts`, comparing a stored title against `toFallbackTitle(url, null)` without case, and cover it in `normalize.test.ts` with an anchor word, a path segment, a snippet-derived title, and a null title
- [x] 1.2 Add `title` to `FetchResult` in `worker/scrape.ts`, read `metadata.title` in `fetchFirecrawlMarkdown` the way `etag` is read, and return null from the transcript, caption, and show-notes paths
- [x] 1.3 Store the title in `fetchAndStoreContent` in `worker/review/score.ts`, in the update that already stores the content key and validators, only when `isTitleFromUrlFallback` holds for the stored title
- [x] 1.4 Cover the store in `score.test.ts`: a title read off the url is replaced, an ingester-native title is kept, and a fetch that returns no title leaves the row alone

## 2. A link preview reads entities as characters

- [x] 2.1 Decode html entities in `toLinkPreviewMetaTags` in `worker/linkPreview.ts`, covering the numeric decimal and hex forms and the named entities a page is likely to write, leaving an unknown sequence as written
- [x] 2.2 Cover both paths in `linkPreview.test.ts`: an entity in `og:title` and one in a plain `<title>`

## 3. Verification

- [x] 3.1 Run `bun run check`
- [x] 3.2 Confirm the derived titles this change targets are the ones the local backfill script claims, so the two agree on what counts as a title read off the url
