## Context

The search bar (`apps/web/src/components/search/SearchBar.tsx`) runs four debounced requests per query, one per kind:
`GET /api/topics/search` (`apps/api/topic/search.ts`), `/api/episodes/search`
(`apps/api/podcast/podcastEpisodeSearch.ts`), `/api/users` (`apps/api/profiles.ts`), and `/api/teams/search`
(`apps/api/team/search.ts`). Each returns at most `USER_SEARCH_LIMIT`, five, and each sits behind `searchRateLimiter`.
Findings never reach the server. The bar filters the findings of whatever feed the page loaded by title, so a finding on
any other topic is never found. The search bar is the only caller of the four routes and their four clients.

Each per-kind search applies its own view rule in SQL: the topic view filter and the admin bypass for topics, the
podcast episode view filter for episodes, public teams plus the caller's own for teams, and the public username search
for profiles. Topic names, team names, usernames, and episode titles and descriptions each have a trigram index.
Resource titles have none.

The MCP server (`apps/api/mcp/`) is stateless on `@modelcontextprotocol/sdk` 1.32 behind `@hono/mcp`. It registers 12
tools. Four of them edit a topic, each saving on the first call: `update_topic_prompt`, `update_topic_fields`,
`add_source`, and `remove_source`. The chat edits a topic differently. Carl calls `proposeTopicEdit` with a
`proposeTopicEditPayload`, the card previews it over the topic as it stands (`toEditableTopicDraft` in
`apps/web/src/components/chat/editableTopicDraft.ts`), and only an agreeing next message applies it, through
`applyTopicEdit` in `apps/api/chat/chatProposals.ts`, which runs the Topic Tools in a fixed order.

`@modelcontextprotocol/ext-apps` 2.0.3 is the current MCP Apps release. It peers on the v2 SDK packages
(`@modelcontextprotocol/server`, `client`, and `core` 2.x), which replace the single v1 package and ship a web-standard
streamable HTTP transport and a per-request handler. The wire protocol of MCP Apps is the same in 1.x and 2.x. A tool
names its card in `_meta.ui.resourceUri`, the card is an HTML resource of type `text/html;profile=mcp-app`, its
resource metadata declares its security policy (`resourceDomains` for scripts, styles, images, fonts, and media), and
inside the frame an `App` receives the tool result and may call other tools and ask the host to open a link.

The podcast audio route `/api/episodes/:id/audio.mp3` checks the session's access to the episode, counts the listener,
and redirects to a presigned object storage url. A card's frame sends no CarlNotes cookie.

`apps/api` imports only `@carlnotes/contracts` and `@carlnotes/nightshift` among the universal packages, and
`apps/web` never imports the api's code. The api already serves files `apps/web` builds: the browser bundle from
`apps/web/dist/client` and the component browser from `apps/web/dist/nightshift`.

## Goals / Non-Goals

**Goals:**
- One search function behind the search bar, the search page, and the MCP `search` tool, so their results never
  differ.
- A shareable, paged `/search` page that a visitor can open, which search engines never index.
- One `edit_topic` tool that saves through the chat's own save path and confirms going public and removing a source on
  the server.
- Cards for the hosts that render MCP Apps, while every tool keeps its structured result and its text for the clients
  that render none.

**Non-Goals:**
- A hosted Storybook MCP endpoint, podcast episode and source management tools, scan status, and new MCP prompts or
  resources beyond the three cards.
- A confirmation for `create_topic` with a public visibility (Open Questions).
- Changing what `search_topic_findings` does. It ranks one topic's findings by meaning over the chat's index, and it
  stays.

## Decisions

### 1. The search reads each kind up to a limit and ranks the union in memory

`searchSite` in `apps/api/search/search.ts` takes the caller, the query, the kinds, the sort, the page, and the page
size. It runs the reader of each requested kind in parallel, each with a per-kind limit of `SEARCH_KIND_LIMIT`, 50,
merges the rows, ranks and sorts them, and returns one page with `rowCount`, `page`, `pageCount`, and `pageSize`. The
per-kind readers stay where they are, take the limit as an argument, and lose their routes.

The bounded union makes a known row count, so the page and `Pagination` can show numbered pages, and a page in the
url opens straight to it. A cursor could not jump to page 4, and the MCP tool takes the page the url takes.

Alternatives: one SQL `UNION ALL` with a global `ORDER BY` and `OFFSET`. The five reads have different shapes, the
episode reader's meaning match is a second read after an embedding, and an offset still reads every branch up to the
offset, so the union saves no work and adds a query nobody can read. The ceiling is 250 rows for a query that matches
more than 50 of every kind, marked with a `ponytail:` comment naming a keyset per kind as the upgrade.

### 2. Kinds rank by how the name matches, then by kind

With the Relevance sort, each row gets a match tier from its name and the query, both lowercased:

1. the name is the query
2. the name starts with the query
3. a word in the name starts with the query
4. the name contains the query
5. it matched another way: an episode's description or meaning, or a finding's url

Rows order by tier, then by kind in the Filters menu's order (topics, podcast episodes, findings, teams, users), then
shorter name first, then id. A name is a topic's or team's name, an episode's title, a finding's title, and a username.

Typing a team's exact name finds that team first, ahead of every topic that only contains the words. The kind order
breaks ties the same way the typeahead's groups read today, and shorter names first keeps each per-kind reader's own
order.

Alternatives: trigram similarity as one score. A long finding title scores low against the same words that make up a
short team name, and the score is not one a person can predict. Grouped sections per kind need a page per section, so
the url and the MCP tool would carry five pages.

### 3. Newest and Trending sort by each kind's own value

Newest sorts by a topic's creation, an episode's publish date, and a finding's publish date, else its fetch date, as
the feed's Newest does. Trending sorts by a topic's viewer count, an episode's listener count, and a finding's view
count, the counts the feed's Trending reads. Teams and profiles have no date or count shown anywhere, so under Newest
and Trending they follow the dated or counted rows in relevance order. Ties fall back to relevance order.

### 4. The findings reader matches resource titles across every readable topic

A new reader, `searchFindingTitles` in `apps/api/search/findingSearch.ts`, matches `lower(coalesce(resources.title,
resources.url))` against the escaped `like` pattern the other readers use, through a new trigram GIN index
`resources_title_or_url_lower_trgm`, and joins the findings that the topic page shows the caller: the topic view
filter, the admin bypass, and an invite topic's findings from the subscription's activation on, through the same
helpers `loadTopicAccessAndFindings` uses. One resource found on two topics is two rows, each naming its topic. The name
leaves out `searchFindings`, which `mcp/results.ts` already uses for the meaning search.

### 5. One request contract shared by the route, the url, and the tool

`packages/contracts/search.ts` gains `searchRequestPayload`: `q`, `kinds` (the Filters menu's `SEARCH_RESULT_KINDS`,
all if absent), `sort` (`TOPIC_FINDING_SORTS`, `relevant` if absent), `page` (from 1), and `size` (`PAGE_SIZES`, 10 if
absent), and the `SearchRow` union the readers return. `SEARCH_RESULT_KINDS` moves there from `SearchFilters.tsx`. `GET
/api/search` parses it, the `/search` route's `validateSearch` parses it, and the MCP `search` tool's input schema is
it, so a url and a tool call with the same values return the same page. The kind filter keeps the menu's `users`
value, whose rows are profiles.

A row carries its kind, id, name, relative page path, date, and count, and per kind: a topic's latest published podcast
episode and, for a signed-in caller, whether they follow it; an episode's topic name and path; a finding's id, url, and
topic name and path; a team's avatar version; a profile's username and avatar version.

The route keeps `searchRateLimiter`. The MCP tool counts one hit against the same limiter's Redis store under the tool
caller's rate limit key, so an agent searches no faster than the site, beside the MCP route's own per-minute limit.
The episode reader keeps its visitor embedding limit and cached query vectors, so paging a query embeds nothing new.

### 6. The search bar shows the first page and Enter opens the rest

The bar sends one debounced `GET /api/search` with `size` 10 and the menu's kinds, renders the rows in rank order with
each kind's existing row component, and ends the list with a See all results row if `rowCount` is larger than the
rows shown. Enter opens the highlighted row, else the only row if there is exactly one, else, for a query at
`SEARCH_MIN_CHARS`, `/search` with the query and kinds and the Relevance sort. A pending search counts as not one row,
so Enter never waits.

On `/search` the bar reads and writes the url: its input holds `q`, the Filters menu's Search for toggles write
`kinds`, and the Sort menu, `TopicFeedSortOptions` in the search bar, writes `sort` and is shown even though the page
has no topic feed. Each write starts at page 1 and pushes history, so the back button returns to the last search.
Elsewhere the Sort menu keeps sorting the feed.

### 7. The page lists its results as the feed lists its findings

`apps/web/src/routes/_layout/search.tsx` renders `pages/SearchPage.tsx`, declares `toNoindexHeadTags("Search")`, and
reads the search in its loader on the server for a visitor, the way the other public routes read through
`loadOnServer`. A signed-in request renders in the browser, as `_layout` already decides, with
`useLoadInBrowser`. The sitemap and the llms files build from live data and list no search url, so leaving them
untouched keeps the page out.

`components/search/SearchResultsList.tsx` renders the rows in the feed's list card, each numbered across pages, with
`common/Pagination` under them, whose links work without JavaScript since the server pages the list. A topic, podcast
episode, team, or profile row shows its kind's icon or avatar, its linked name, and a line with its counts and the
podcast play pill. A finding row is the feed's own `TopicResource`, whose click opens the finding's note, with the
chapter pill and the topic after its age, and its bookmark on that line, since search keeps each row's rank. The page
starts with `TagsAndNewTopicRow`, the home page's tags and New Topic row, and its title counts the results. A new search
shows skeleton rows, and another page of the same search keeps the count and the page row while one skeleton row shows
per result that page holds. An empty search names the kinds turned off, and a finding view names that it searches
findings alone.

### 8. edit_topic saves through the chat's save path

`edit_topic` takes `topic_id`, the `proposeTopicEditPayload` fields, and an optional `confirmation`. The chat's four
save functions and `applyTopicEdit` move out of `tool/chatTools.ts` and `chat/chatProposals.ts` into
`tool/topicEditSaves.ts`, renamed from their `InChat` names, and the save binding gains the Prompt Version origin. The
chat calls them with `chat` and the tool with `mcp`, so both apply the same saves in the same order through the Topic
Tools, which check edit rights themselves. The tool reads each save's outcome from the same record the chat's toasts
read.

The tool first asks `isAllowed(user, "topic:edit", topic)` itself before it reads the topic for a preview, so a user who
may not edit never sees invites or source ids through it. `beforeTopicDraft` is the topic's fields in the card's
`TopicDraft` shape, each saved source with its id. `afterTopicDraft` is the topic read again once a save ran, or
`toEditableTopicDraft(beforeTopicDraft, edit)` for a preview. `toEditableTopicDraft` moves to
`packages/contracts/topicEdits.ts`, so the api, the chat's card, and the MCP card project an edit the same way.

The result is `{ status, beforeTopicDraft, afterTopicDraft, serverToolCallOutputs }` with `status` `saved`,
`confirmRequired`, or a rejection, and text naming each save or what stopped it. It is an error only if no save ran.

`update_topic_fields` is removed with the other three. Keeping it would let an agent make a topic public with no
confirmation, beside the tool that asks for one.

### 9. The confirmation is a keyed digest of the edit and the topic it previewed

An edit needs confirming if it sets `visibility` to `public` on a topic that is not public, or names any source to
remove. Without a valid `confirmation`, the tool saves nothing and returns `confirmRequired` with the preview, the
reasons, and a confirmation: `<expiresAt>.<signature>`, where the signature is `toAuthSecretSignature` over the
canonical json of the user id, the topic id, the edit, `beforeTopicDraft`, and `expiresAt`, with its own purpose, and
`expiresAt` is 15 minutes out. The tool description and the text say to call again with the same edit and the
confirmation once the user agrees.

A second call recomputes the signature from the edit it was given and the topic as it stands now, and saves only if both
match and the time has not passed. `beforeTopicDraft` in the digest makes the confirmation single use with no table: the
save changes the topic, so the same confirmation never matches again, and an edit made elsewhere between the preview and
the confirmation voids it. `toCanonicalJson` moves out of `chatProposals.ts` into `apps/api/canonicalJson.ts`, which the
chat's digest and this one share.

Alternatives: a row in `chat_proposals`. Its rows belong to a chat turn and a page, and a stateless MCP call has
neither. A Redis key would need a cleanup and a read on every call for what a signature already proves.

### 10. follow_topic calls the page's subscribe write

`follow_topic` takes `topic_id` and `is_following`, returns the connect-an-account result to a visitor, and calls
`setTopicSubscription`, whose `subscriptionSource` becomes an argument so the event says `mcp`. The write's own rules
stand: a hidden or private topic is rejected, and an owner cannot unfollow. Its name and argument are copy, so they say
follow, and every identifier behind them says subscribe.

### 11. The server moves to the v2 SDK

`server.ts` builds an `McpServer` from `@modelcontextprotocol/server` per request, as now, and serves it through the
SDK's web-standard streamable HTTP transport or `createMcpHandler`, from inside the Hono routes, so `@hono/mcp` goes.
`trackToolCalls` keeps wrapping `registerTool`, and `registerAppTool` calls `registerTool`, so card tools are tracked
too. The smoke clients move to `@modelcontextprotocol/client`.

### 12. The cards are one bundle in apps/web, read by the api as three resources

`apps/web/src/mcpCards/` holds the card entry and the three cards. `apps/web/vite.mcpCards.config.ts` builds it with
`inlineDynamicImports`, `cssCodeSplit: false`, and every asset inlined, to `apps/web/dist/mcp-cards/cards.js` and
`cards.css`. `apps/web`'s `build` script runs it after the ui build, so `bun run build:ui` and the image's build already
make it.

`apps/api/mcp/cards.ts` registers three resources with `registerAppResource`: `ui://carlnotes/search.html`,
`ui://carlnotes/topic.html`, and `ui://carlnotes/findings.html`. Each read returns one HTML document: the css in a
`<style>`, a `data-card` attribute naming the card, and the js in a `<script type="module">` with every `</script`
escaped. The api reads the two files once from `apps/web/dist/mcp-cards/` the way `nightshift.ts` reads its
directory, and keeps them in memory. A missing build fails the resource read with a message naming `bun run build:ui`,
and every tool still works.

Each resource declares `resourceDomains` with the site's origin, for avatars, favicons, covers, and the audio route,
and the object storage origin, taken from one presigned url so it matches the host the presigner signs for. No card
declares `connectDomains`: a card makes no request of its own and gets everything through tool results and tool calls.

Alternatives: a static `ui://` HTML that loads scripts from `carlnotes.com`. It needs the api to serve a second bundle
over HTTP and the site origin in `script-src`. Inlining makes each read larger, by the bundle's size, and hosts cache
resources by uri.

### 13. The cards render the site's components through swapped clients and links

The card entry creates the `App` with `useApp` from `@modelcontextprotocol/ext-apps/react`, follows the host's theme
with the `dark` class, reports its size, and renders the card `data-card` names from each `ontoolresult`. It mounts the
card in a memory-history TanStack router, so a shared component's router hooks work.

- **Links.** `AnchorLink` reads an optional open-link function from a context. The card provides one that makes the
  href absolute with `SITE_URL` and calls `app.openLink`, so every shared link opens on carlnotes.com in the host.
- **Clients.** The card build aliases `@carlnotes/client/authClient` to a module whose session is the caller the tool
  result names, `@carlnotes/client/podcastEpisodeClient` to a module that returns the podcast episodes the tool result
  carries, and every other `@carlnotes/client` module to one that throws, the way `.storybook/main.ts` swaps them. The
  site's podcast player store, audio element, and play buttons then run unchanged, and nothing in a card can reach the
  api by itself.
- **Actions.** The feed's handlers in `TopicFeedProvider` come from its provider, so the findings card provides handlers
  that call `rate_finding`, `bookmark_finding`, and `mark_finding_consumed` through `app.callServerTool`, and the card's
  Follow calls `follow_topic`. The host sends those calls over the same connection with the same token, so they pass
  the same authorization and rate limit as any call.
- **The topic card** is `TopicDraftCard`, whose dismiss button becomes an `onDismiss` prop the chat passes as
  `clearProposedTopicEdit`, so the component no longer imports the chat store. The card shows `afterTopicDraft` with
  `isTopicEditProposed` for a preview, and a Save button under it for `confirmRequired` that calls `edit_topic` with the
  edit and the confirmation, then shows the saved result.
- **The search card** is `SearchResultsList` with its paging calling `search` again with the next page, its findings'
  notes saving through the finding tools, and a See all button that opens the `/search` url with the same parameters.
- **The findings card** is the topic header, `TopicNameLink` with its play button and Follow, over the finding rows in
  `TopicResource`.

### 14. Card audio plays through the audio route with a signed play token

A tool result gives each podcast episode the audio route's absolute url with a `play` query:
`<expiresAt>.<userId>.<signature>`, the user id empty for a visitor, with the signature over the episode id, the
caller's user id or none, and `expiresAt`, 24 hours out. The audio route accepts a valid token in place of a session, as
that user or as a visitor, then checks access, counts the listener, and redirects to the presigned url as it does for a
page. A private episode plays for the user who may hear it, and every play counts.

If the audio element errors, because the host's frame blocks the media origins or the token expired in an old
conversation, the card replaces the player with a Listen on CarlNotes link to the episode page.

Alternatives: the presigned url in the result. It never counts the listen, and it expires in minutes.

## Risks / Trade-offs

- [The v2 SDK speaks the 2026-07-28 protocol] → The smoke initializes with an older protocol version too, and the
  server must still list its tools to it. If it cannot, `ext-apps` 1.7.5 on the v1 SDK has the same wire protocol and
  is the fallback.
- [The card bundle is large, inlined into each resource read] → Hosts cache a resource by uri. If a host rejects the
  size, serve the assets from `carlnotes.com` and name it in `resourceDomains`.
- [An agent can repeat the confirmation without asking the person] → The client's own approval prompt covers every
  call of a destructive tool, the text tells the agent to ask, and the card's Save button is the person's own click.
  The confirmation still binds the exact edit to the topic as previewed.
- [The trigram index on `resources` locks writes while it builds] → Count the table's rows before the deploy. If the
  build would take more than a few seconds, create the index `CONCURRENTLY` by hand first and write the generated
  migration's statement as `CREATE INDEX IF NOT EXISTS`, so it skips the index that is there.
- [The 250-row ceiling hides matches past 50 of a kind] → The page shows the count it has, and the `ponytail:` comment
  names the upgrade.
- [A shared component reaches a client the card throws on] → The card's stories render every card in Storybook, whose
  fetch guard fails on any `/api` request, and a test renders each card with the throwing clients.

## Migration Plan

1. Deploy with the migration. The old search routes go in the same deploy as the bar that stops calling them, and the
   web and api ship from one image.
2. MCP clients refresh their tool list when they reconnect. A client calling a removed tool gets the SDK's unknown tool
   error. The docs page names the new tools.
3. Rollback is the previous image. The index is harmless to leave.

## Open Questions

- Should `create_topic` with `visibility: "public"` confirm the same way? The request asked only for edits, so this
  change leaves creation as it is.
