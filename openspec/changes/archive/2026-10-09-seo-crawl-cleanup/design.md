## Context

Search Console reports 44 URLs discovered and not indexed, and 17 crawled and not indexed. Three things in the app
feed that. `/topics` is a public index that nothing links to, kept for crawlers that the homepage's paged sections
already serve. Every page's header links `/login?next=<path>`, so each public page links its own crawlable sign-in
url, and
`robots.txt` allows everything. Every table on a public page shows five rows a page, so a crawler sees a sliver of a
topic and follows page links for the rest. The sitemap was suspected of lagging, but the live copy is right: it is
served with a one-hour cache, which is what Search Console and a browser saw, and the homepage and the sitemap already
share `isPublicAndShown`. The episode pages already have their JSON-LD and sit in the sitemap.

The ui has no crawler detection of its own, and needs none. The podcast episodes card and the chapters table already
render every row of their list and hide the rows off the page shown with the `scripted:hidden` class, which the first
paint script turns on. A browser sees one page, and a reader without JavaScript, a crawler included, sees the whole
list.

## Goals / Non-Goals

**Goals:**

- Retire `/topics` with a permanent redirect, and stop the sign-in url leak at both ends: the link and the crawl.
- Give a reader without JavaScript whole tables, up to fifty rows, on the public pages, with no change for a browser.
- Give every public topic page five plain links to related public topics.

**Non-Goals:**

- Changing the sitemap's dating rule, its topic list, or its one-hour cache. All three checked out.
- Changing the episode pages' head or JSON-LD, which already match what was asked.
- Telling a crawler from a browser. Every reader gets the same HTML, and JavaScript hides what a page does not show.
- A homepage card's "+ N more" expander. The card keeps its five rows, and the expander becomes a link without
  JavaScript in the analytics change that follows this one.

## Decisions

**`/topics` redirects from the documents route.** The permanent redirect joins `/pricing` in `api/documents.ts`, where
the other retired path lives, so the ui's not-found page is never involved.

**The leak is closed at the link and at the crawl.** `ui/public/robots.txt`, which the api serves with the built ui,
disallows `/login` and `/signup`, and the header's two sign-in and sign-up links get `rel="nofollow"`. Google cannot
read `noindex` on a url it may not fetch, so a disallowed url that pages still link can be indexed as a bare link.
`nofollow` stops the discovery, and the disallow stops any fetch that still happens. The `next` param stays, since it is
what returns a user to their page.

**A paged list renders its first fifty rows and hides the rows off the page with JavaScript.** `shared/seo.ts` holds
`NO_SCRIPT_ROW_LIMIT = 50`, which the seo smoke test reads too, and `ui/src/lib/renderedRows.ts` holds
`toRenderedRows(rows, { pageNumber, pageSize })`, which returns the page's rows and the list's first fifty, each with
its class: `scripted:hidden` off the page, and `scripted:after:hidden` on the page's first row so its dashed separator
does not draw. The homepage sections, the scan history, the podcast episodes card, and `usePagination`'s tables render
those rows. The server and the browser render the same markup, so hydration matches, and a reader without JavaScript
sees every rendered row. A section's page links are hidden without JavaScript while the HTML holds every row, so a
crawler that runs no JavaScript does not crawl five urls of one list. The topic page's findings list renders its
findings, up to fifty, hides the rows past five until the expander opens, and hides the expander itself without
JavaScript. A homepage card keeps its five rows.

**"More topics" loads with the page and renders as one list.** The topic page payload gains `moreTopics`, an array
of up to five `{ id, name }`, loaded with the page. `api/topic/moreTopics.ts` reads the other public shown topics,
ordered by whether a public team holding this topic holds them, then by how many tags they share with it, then by
their newest finding, and stops at five. The topic itself is left out, and a topic that is not public and shown gets
an empty array from a check run beside the holding-teams read, before the candidate query. The section renders last
on the page as plain `AnchorLink`s, which is already a server-rendered `<a>`, so it works without JavaScript.

**Tags barely matter today.** Four of twenty-five public topics have tags, and twenty-three have an owning team, so the
team rule does most of the work and the recency rule fills the rest. The tag rule costs one subquery and starts paying
as tags are written.

## Risks / Trade-offs

- [A page with fifty hidden rows is heavier] → a topic keeps at most twenty findings, a scan row is one line, and the
  homepage's sections hold twenty-five public topics today. The HTML grows by tens of kilobytes, compressed at the edge.
- [A list past fifty rows] → a reader without JavaScript gets the first fifty and the page links, which lead to the
  same fifty plus that page's rows. The lists are far from fifty today.
- [`/topics` was indexed] → it was in the sitemap for weeks, so the 301 keeps whatever rank it had on the homepage.
- [Search Console's counts lag] → the report reflects crawls from before this change for weeks. Judge it after a
  month.

## Migration Plan

1. Deploy. No migration, no setting, no prompt.
2. In Search Console, request indexing of the homepage once, and watch the "Discovered – currently not indexed" count
   over the following weeks.

Rollback: revert the commit. `/topics` returns as a page, and the sitemap lists it again on its next request.
