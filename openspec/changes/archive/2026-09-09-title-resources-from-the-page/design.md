## Context

Findings render `resources.title`. A Resource discovered as a link on a page arrives with only its anchor text, so ingestion's derive-a-title rule falls back to the url's last path segment. On a repository or a release feed that gives `.github`, `v0.3`, and 40-character shas.

The page's own title is already fetched twice over and used neither time. The review's Firecrawl scrape parses `data.metadata` for `etag` and `last_modified` and drops the `title` beside them. Chat link previews parse a page's meta tags for their cards, and hand back text with its html entities undecoded.

## Goals / Non-Goals

**Goals:**

- A Finding names its page, using data already in responses the app makes.
- A link preview stores the characters a page meant, not its markup.

**Non-Goals:**

- Retitling the Resources already stored. They are never re-reviewed, so nothing refetches them; a one-off script handles those and is not spec'd.
- Fetching a title at ingestion. That would put a real title in front of the relevance gate, which today embeds anchor text, but it costs a fetch per link on every Scan and is a separate decision.
- Reading a title on the transcript, caption, and show-notes paths. None of them fetch a page.

## Decisions

**The test for a replaceable title is the derive-a-title rule run against the url alone.** The rule already returns either a snippet line or the url's last path segment. Running it with no snippet gives the url form on its own, and comparing the stored title against that answers whether the title was read off the url, with no new column and nothing to keep in sync.

The alternative — replacing whatever title is stored — was measured against the live feed before being rejected. Of 81 rows it would have touched, about five got worse: `The Ultimate Raccoon Cuteness Overload! … - video Dailymotion` became `Dailymotion`, and `Senior Software Engineer (Full Stack) @ Rec | NFX Guild Job Board` became `NFX Guild Job Board`. A search result's snippet usually opens with the page's real title, so the derived title was already right and the page's own title was its site's name. Restricting the replacement to titles read off the url left 24 rows, all of them improvements.

The comparison ignores case because an anchor word and the path it points at are the same name written two ways: a link labelled `Latest` pointing at `/releases/latest` is read off the url as surely as one labelled `latest`.

**Entities are decoded in the meta-tag parse, not at its call sites.** Both paths need it — `HTMLRewriter` hands back a `<title>`'s raw text chunks, and `getAttribute` hands back an attribute as written — and both feed the same two stored columns. Decoding once where the tags are read keeps the two call sites, chat previews and finding previews, from each solving it.

## Risks / Trade-offs

- **A page whose own title is its site's name still replaces a title read off the url, and a site name beats a sha but not by much.** → Accepted. The row it replaces named nothing at all, so the floor rises either way.
- **Firecrawl decides what `metadata.title` holds.** → It is read defensively, as `etag` already is: a non-string is treated as absent, and an absent title leaves the row alone.
- **Only Resources that are fetched are retitled, so a Resource reused from storage or revalidated with a 304 keeps its derived title.** → Accepted for stored rows, which the backfill covers. New Resources are always fetched on the Scan that discovers them, which is the Scan that writes their Finding.
