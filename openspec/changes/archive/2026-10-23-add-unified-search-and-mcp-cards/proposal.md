## Why

The search bar sends four searches per query, one per kind, and filters findings out of whichever feed the page loaded,
so a finding on a topic the page did not load is never found, and there is nowhere to see more than five results of a
kind. An agent has no way to find anything by name, edits a topic through four tools that each save on the first call,
and gets plain JSON back in a client that could render a card.

## What Changes

- **One search.** A server function returns topics, findings, podcast episodes, teams, and profiles for a query, with
  the Filters menu's kinds, the sort menu's Relevance, Newest, and Trending, and numbered pages, under the view rules
  and the search rate limit the per-kind searches apply now. The search bar, a new `/search` page, and a new `search`
  MCP tool all call it. Findings are searched on the server across every topic the caller may read, through a new
  trigram index. **BREAKING** for api clients: `GET /api/topics/search`, `/api/teams/search`, `/api/users`, and
  `/api/episodes/search` are replaced by `GET /api/search`.
- **The search page.** Enter in the search bar opens the highlighted suggestion or the only result, and otherwise opens
  `/search` with the whole search in the url: the query, kinds, filters, tags, sort, page, and page size. The page lists
  its results numbered and paged as the feed lists its findings, with the home page's tags and New Topic row, and a
  finding opens its note. It renders on the server for a visitor, declares `noindex`, and stays out of the sitemap and
  the llms files.
- **Finding views.** A finding counts views again, every open, a visitor's included when it comes from the site within
  the count rate limit. Its note shows Views, and Trending orders findings by them. The Rated down view goes, so a
  thumbs down hides a finding from every view.
- **The player card's trash button.** The topic page's podcast player card loses its remove button. The episodes list
  and the episode page's actions menu still remove an episode.
- **edit_topic.** One MCP tool takes the payload Carl proposes in chat and saves it through the chat's own save path. An
  edit that makes a topic public or removes a source returns a preview and a confirmation the first time, and saves only
  when called again with that confirmation. **BREAKING** for MCP clients: `update_topic_prompt`, `update_topic_fields`,
  `add_source`, and `remove_source` are removed. `update_topic_fields` goes too, since it could make a topic public with
  no confirmation.
- **follow_topic.** An MCP tool follows or unfollows a topic for the connected account.
- **MCP cards.** The search, topic, and finding tools name a card that hosts rendering MCP Apps show in a sandboxed
  frame: the search page's results list, the topic card the chat shows, and finding cards. Each card's buttons call the
  same tools any client calls. Every tool still returns its full structured result and a text summary.
- **MCP SDK v2.** The current MCP Apps release, `@modelcontextprotocol/ext-apps` 2.0.3, requires the v2 MCP server SDK,
  so the server moves from `@modelcontextprotocol/sdk` 1.x and `@hono/mcp` to `@modelcontextprotocol/server` 2.x.

## Capabilities

### New Capabilities

- `site-search`: the one search function, how kinds rank against each other, its sorts and pages, the search bar's
  Enter, and the `/search` page.
- `mcp-cards`: the MCP Apps cards: their resources, how the bundle is built and served, their security policy, what each
  card shows and which tools its controls call, and the fallback for a host that blocks playback.

### Modified Capabilities

- `mcp-server`: the tool list, the `search` and `follow_topic` tools, page-numbered search results beside the cursor
  pages, and the settings tool's removal.
- `topic-tools`: `edit_topic` replaces the MCP edit tools and confirms going public and removing a source on the
  server, and the source removal rule names `edit_topic`.
- `podcast-episode-search`: podcast episodes are found through the one search, ranked with the other kinds, with no
  route or five-result limit of their own.
- `seo`: the search page is kept out of search results, the sitemap, and the llms files.

## Impact

- `apps/api`: a new `search/` folder with the search function and `GET /api/search`; the per-kind search functions stay
  as its readers and lose their routes; `mcp/` gains `search`, `edit_topic`, `follow_topic`, the card resources, and the
  v2 SDK; the audio route accepts a signed play token from a card.
- `apps/web`: a `/search` route and page, the search bar's Enter and controls, `AnchorLink` opening links through a card
  host, a `TopicDraftCard` that takes its dismiss as a prop, and a second Vite build that writes the card bundle to
  `apps/web/dist/mcp-cards/`.
- `packages/contracts`: the search request and result contracts, and the topic edit preview moved from the web app so
  the api and the cards share it.
- `packages/client`: one `search` client in place of four.
- `packages/db`: a migration adding a trigram index on resource titles.
- Dependencies: adds `@modelcontextprotocol/ext-apps` 2.0.3, `@modelcontextprotocol/server` and
  `@modelcontextprotocol/client` 2.x; removes `@modelcontextprotocol/sdk` and `@hono/mcp`.
- Docs: the Add to AI docs page and the AGENTS.md files of `apps/api` and `apps/web`. The Add to AI dialog's copy names
  no tool, so it stays as it is.
