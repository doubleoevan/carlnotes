## 1. Contracts and the index

- [x] 1.1 Add `searchRequestPayload` and the `SearchRow` union to `packages/contracts/search.ts`, accepting `kinds` as a
      comma list or an array, with defaults for every field, and move `SEARCH_RESULT_KINDS` there from
      `SearchFilters.tsx`; test the parse of a url's values and a tool's arguments to the same request
- [x] 1.2 Move `toEditableTopicDraft` and `EditableTopicFields` to `packages/contracts/topicEdits.ts`, keep their test
      beside them, and point the chat at the new module
- [x] 1.3 Add the `resources_title_or_url_lower_trgm` GIN index to `packages/db/schema/scans.ts`, run
      `bun run db:generate`, count the `resources` rows in production, and write the statement as
      `CREATE INDEX IF NOT EXISTS` if the build needs to run `CONCURRENTLY` by hand first

## 2. The search function

- [x] 2.1 Give the topic, team, profile, and podcast episode readers a limit argument, delete their four routes, and
      delete `searchTopics`, `searchTeams`, `searchUsers`, and `searchPodcastEpisodes` from `packages/client`
- [x] 2.2 Add `searchFindingTitles` in `apps/api/search/findingSearch.ts` over the new index, reusing the topic view
      filter, the admin bypass, and the invite activation gate that `loadTopicAccessAndFindings` applies
- [x] 2.3 Add `searchSite` in `apps/api/search/search.ts`: the per-kind reads in parallel at `SEARCH_KIND_LIMIT`, the
      match tiers, the kind order, the Newest and Trending values with teams and profiles after, and the page slice,
      with a `ponytail:` comment on the 250-row ceiling
- [x] 2.4 Add `GET /api/search` behind `searchRateLimiter`, mount it, and add one `search` client in
      `packages/client/searchClient.ts`
- [x] 2.5 Test the kinds, the kind filter, each sort, the tiers and their ties, paging and a page past the end, a short
      query, a visitor's public-only results, a member's private team, an invite subscriber's later findings, and the
      rate limit
- [x] 2.6 Add the finding match's plan check to `apps/api/searchPlans.smoke.ts`

## 3. The search bar and the search page

- [x] 3.1 Let `common/Pagination` render links that show without JavaScript for a list the server pages
- [x] 3.2 Add `components/search/SearchResultsList.tsx`: numbered rows in the feed's list card, each kind's line and play
      pill, a finding as the feed's `TopicResource` with its note, chapter pill, and bookmark on its line, the page row,
      and skeleton rows, with stories for every kind, a later page, one page, a loading page, a bookmark, and a phone
- [x] 3.3 Add `routes/_layout/search.tsx` with `validateSearch` from the contract, `toNoindexHeadTags("Search")`, and a
      server loader for a visitor, and `pages/SearchPage.tsx` with the loading and empty states
- [x] 3.4 Rewrite `SearchBar.tsx` over one debounced `search` call: the ranked rows with each kind's row, the See all
      results row, and the Enter rule
- [x] 3.5 On `/search`, bind the bar's input, the Search for toggles, and the Sort menu to the url, pushing history
      and resetting the page, and show the Sort menu there with no topic feed
- [x] 3.6 Test Enter with one result, with several, with a pending search, and with a highlighted row, and the page's
      url state: a shared url, back, a sort resetting the page, and a rejected value falling back
- [x] 3.7 Check in the browser at 375 pixels and at desktop width, signed out and signed in, that the page renders, the
      server html holds a visitor's results, and the head says `noindex, follow`

## 4. The MCP SDK v2

- [x] 4.1 Replace `@modelcontextprotocol/sdk` and `@hono/mcp` with `@modelcontextprotocol/server` and, for the smoke,
      `@modelcontextprotocol/client` 2.x, following the SDK's v1 migration guide
- [x] 4.2 Serve each request's `McpServer` through the web-standard transport in `server.ts`, keep `trackToolCalls`,
      and move the smoke clients to the v2 client
- [x] 4.3 Run `bun run smoke:mcp` and `bun run smoke:tools`, and initialize once with an older protocol version to
      confirm the tool list still lists

## 5. The new and removed MCP tools

- [x] 5.1 Move the four save functions and `applyTopicEdit` into `tool/topicEditSaves.ts`, renamed from their `InChat`
      names, with the Prompt Version origin in the binding, and move `toCanonicalJson` to `apps/api/canonicalJson.ts`;
      the chat's tests stay green unchanged
- [x] 5.2 Add `edit_topic` in `mcp/tools.ts`: the edit gate before the topic read, the before and after, each save's
      outcome, and the error only if no save ran
- [x] 5.3 Add the confirmation in `mcp/topicEditConfirmations.ts`: when one is required, the keyed signature over the
      user, topic, edit, before, and expiry, and its check
- [x] 5.4 Remove `update_topic_prompt`, `update_topic_fields`, `add_source`, and `remove_source`, and the wording
      helpers only they used
- [x] 5.5 Add `follow_topic` over `setTopicSubscription` with `subscriptionSource` as an argument
- [x] 5.6 Add `search` over `searchSite` with absolute row urls, the `/search` url, the search rate limit hit, and a
      text line per row
- [x] 5.7 In `tools.test.ts`, test that the removed tools are gone, the tool list and its annotations, and every
      description addressing the client; test `edit_topic` saving each field, the confirm step for going public and
      for removing a source, a mismatched, repeated, stale, and expired confirmation, and an edit that needs none;
      test `follow_topic` following, unfollowing, a visitor, and an owner unfollowing
- [x] 5.8 Test every tool's structured result and text with the card resources registered and without them

## 6. The card bundle

- [x] 6.1 Add an optional open-link context to `AnchorLink`, give `TopicDraftCard` an `onDismiss` prop that the chat
      passes, and let `TopicFeedProvider` take its handlers from its provider
- [x] 6.2 Add `src/mcpCards/` with the entry: `useApp`, the host theme, size reporting, the memory router, the
      open-link provider, and the card that `data-card` names
- [x] 6.3 Add the card client modules, the session from the tool result, the podcast episodes from the tool result,
      and a throwing module for every other client, and alias them in `vite.mcpCards.config.ts`
- [x] 6.4 Build the search card on `SearchResultsList` with paging through `search`, Follow through `follow_topic`, the
      finding notes through the finding tools, and See all
- [x] 6.5 Build the topic card on `TopicDraftCard` with the preview mark and Save through `edit_topic`
- [x] 6.6 Build the findings card on the topic header and `TopicResource`, its handlers calling `rate_finding`,
      `bookmark_finding`, and `mark_finding_consumed`
- [x] 6.7 Add the player fallback: an audio error replaces the player with the episode page link
- [x] 6.8 Run the card build from `apps/web`'s `build` script, and add stories for each card for a visitor and a user
      with a mocked app bridge

## 7. Serving the cards

- [x] 7.1 Add `mcp/cards.ts`: read and keep the built files, write each card's HTML with `</script` escaped, register
      the three resources with their `resourceDomains`, and fail a read with the build message if the files are missing
- [x] 7.2 Name the cards in `search`, `edit_topic`, `create_topic`, `read_topic_feed`, and `search_topic_findings`
- [x] 7.3 Add the play token: sign it in the tool results for each podcast episode, accept it in the audio route in
      place of a session, and test a valid token, another episode's, an expired one, and a private episode for its owner
- [x] 7.4 Test the resource html, the escaping, the security policy, and the missing build message

## 8. Smoke, docs, and the gate

- [x] 8.1 Update `mcpSmokeSections.ts` and `mcpSmokeFixtures.ts` for the new tool list, and add a section that calls
      `search` and `edit_topic`, confirms a public edit, and reads each card resource
- [x] 8.2 Rewrite the What your AI can do section of `apps/docs/src/content/docs/account/add-to-ai.md` for `search`,
      `edit_topic` and its confirmation, `follow_topic`, and the cards, check the page linked from its Edits bullet,
      and run `bun run docs:embed`
- [x] 8.3 Update `apps/api/AGENTS.md` for `search/`, the new `mcp/` files, `tool/topicEditSaves.ts`, and the removed
      routes, and `apps/web/AGENTS.md` for the search page, `SearchResultsList`, `src/mcpCards/`, and the card build,
      and the root routing table's MCP row if its paths change
- [ ] 8.4 Load a card in a host that renders MCP Apps, against a local api through a tunnel, and confirm the three
      cards render, play, and call their tools
- [x] 8.5 Run `bun run check`
