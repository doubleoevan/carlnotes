# Tasks

Part C of the launch hardening work. Groups 1 to 3 are the request's items Eighteen to Twenty, one group each.
Group 4 holds a finding from the closing read, marked with its id from the findings table in `launch-hardening`'s
design. Group 5 is the integration checks. This change ships last, after `launch-hardening-page-reads`. Nothing a
person reads changes.

## 1. The layout's requests (item 18, with finding R18)

- [ ] 1.1 Add an `isEnabled` option to the feed query in `packages/core/hooks/useTopicFeedState.ts`, true by default
      so the mobile app is unchanged, export the query's options for a prefetch, and memoize the returned state
      with one shared empty array for pending changes. Verify: `useTopicFeedState.test.tsx` shows a disabled query
      sends nothing and the value is stable across renders
- [ ] 1.2 Count mounted readers in the web's `TopicFeedProvider` (the Topics page, the tags row, the Edit topic
      dialog register through one hook), enable the query while a reader is mounted and the session is known, and
      memoize the provider's value. With no reader mounted, a reload marks the feed stale and fetches nothing.
      Verify: a test that a page with no reader sends no feed request, and that a signed-in full page load sends
      one, never two
- [ ] 1.3 Prefetch the feed on hover, focus, and touch start of the links to the Topics page and the New Topic
      buttons, with a few seconds of stale time on the prefetch and the query. Verify: a test that hover then
      click sends one request
- [ ] 1.4 Add `GET /api/badges` with its contract, client, and registry entry: the chat mention count, the pending
      topic invites, the note badges, the unseen Comment Mentions, and for an admin the open report count, each in
      the shape its own route returns. Leave the six existing routes as they are. Verify: a contract test, the
      freeze check, and a budget for the route
- [ ] 1.5 (finding R18) Cache the note badges and the pending invites per user, cleared by each write that changes
      them, as the Comment Mentions are. Verify: a second badges read sends no note or invite query, and a test
      for each clearing write
- [ ] 1.6 Read the badges with one poll on the web and on mobile: `startUpdateBadgePoll` takes the one read and feeds
      the five stores, `useNoteBadges` loses its interval and keeps its refresh after a read note, the Comment
      Mentions load skips its first run and keeps its read on a path change and after the person's own Comment,
      and the rooms stay their own read. Verify: `updateBadgePoll.test.ts`, and a test that a signed-in layout
      sends three requests at load (the session, the badges, the rooms) and one every 45 seconds
- [ ] 1.7 Load a profile's team statuses only with a session. Verify: a visitor's profile sends no team statuses
      request
- [ ] 1.8 Add the layout's request budget to the web's route tests and the shared list from
      `launch-hardening-page-reads`: three signed in, one for a visitor. Verify: adding a layout request fails the
      test
- [ ] 1.9 Docs: `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, `apps/mobile/parity.md`. Verify:
      the badges route and the one poll are named

## 2. The first paint (item 19, with finding R15)

- [ ] 2.1 Choose the header's links and menu and the home's first section from `useIsSignedInBeforeSession`, with an
      avatar-sized placeholder until the session names the user, and keep the home's view event waiting for the
      session. Verify: a route test that a load with a session cookie never renders the visitor's links or the
      "How it works" steps, and that a stale cookie falls back to the visitor's face with no error
- [ ] 2.2 Start the home, news, and opener reads at mount if the cookie flag is set, under one stable viewer key on
      the web. Verify: a test that the home read starts before the session read returns, and is not sent twice
- [ ] 2.3 Give the layout route a pending component with no minimum time, built from the existing skeletons. Verify:
      the server's html for a signed-in load holds the shell
- [ ] 2.4 Add a priority option to `TopicImage` and its file props, with both apps' adapters: priority loads eagerly
      at high priority, everything else is lazy and decoded off the main thread. Set it on the page header image
      and the home's first three cards (the card renderer gains the index). Verify: the primitive's test, both
      apps' stories, and the component parity check
- [ ] 2.5 (finding R15) Give the film player's poster a sized source and the priority on the topic page, and make
      avatars and the film thumbnail lazy and decoded off the main thread. Verify: the topic page's html marks the
      poster eager and high priority
- [ ] 2.6 Derive page, list, and thumbnail sizes for the film image from a 16:9 table beside the topic image's
      (384 by 216, 120 by 68, 48 by 27, each also at twice that), with their keys in
      `topicPodcastEpisodeVideoKeys.ts`, added to the film's key list so a removed film and a replaced image delete
      them. The image route serves each size, and falls back to the poster under a short cache for a film not yet
      backfilled. The url function derives each size's path from the poster path, so no contract field changes.
      Verify: key, route, and url tests
- [ ] 2.7 Add a backfill behind a root script that draws the three sizes for each film with an image of its own,
      from the stored image. No render version bump. Verify: one pass in dev, a film card loads the page size, and
      the 120-pixel thumbnail loads the list size
- [ ] 2.8 Write one string transform in `packages/core/lib/topicPostBodyHtml.ts` that turns a stored body into what
      the reader shows: each image at its stored width and height, lazy and decoded off the main thread except the
      first, list items and checkbox lists as the editor package shows them, and each ordered list's digit width.
      Verify: a test that compares its output with the editor package's reader for stored bodies
- [ ] 2.9 Render the Topic Post's body from that transform on the server and in the browser, as a plain element
      with the reader's class, with the reader's rules in the page's own stylesheet, the stored html sanitized
      again on read, and link presses, the broken image class, and code coloring kept. The editor keeps its lazy
      package. Verify: the server's html holds the body's images and code blocks, the article's height is the same
      before and after hydration, and a reader loads no editor chunk
- [ ] 2.10 Leave the server-rendered header and the film poster out of the hydrate-in animation on the topic page.
      Verify: `useRevealClassName.test.tsx`
- [ ] 2.11 Serve the storage origin from one small public read, fetched on the first intent, and append one
      preconnect link with no `crossorigin` attribute on hover, focus, or touch start of a play control. Verify: a
      test that hover adds the link once and sends no request to a counted route
- [ ] 2.12 Docs: `apps/web/AGENTS.md`, `apps/api/AGENTS.md`, `packages/db/AGENTS.md`, `packages/pipeline/AGENTS.md`,
      the README's script list. Verify: the film sizes and the backfill script are named

## 3. The bundle and the press (item 20)

- [ ] 3.1 Make the Edit topic dialog lazy behind a named loader in `TopicEditorChoiceDialog.tsx`, used by every
      importer, preloaded from the New Topic buttons and the menu's option and again when the choice dialog opens.
      Verify: the layout's static closure holds no Edit topic chunk, and the dialog opens with no loading state
      after a hover
- [ ] 3.2 Make the rank dialogs, the Topic Post page's share, image, and confirm dialogs, the Add to AI dialog, and
      the Report issue dialog lazy, preloaded when the page actions menu opens. Verify: each is absent from its
      page's static closure
- [ ] 3.3 Make the Video dialog and the film player lazy in the film button, with the loader the returned film
      dialog already has, preloaded from the button's intent handlers. Verify: a film card's chunk holds no player
- [ ] 3.4 Make both chat panels lazy with the loading panel as the fallback, preloaded from the chat pill's intent
      handlers. The messages' Markdown chunk still loads when a chat opens. Verify: the layout's static closure
      holds neither panel
- [ ] 3.5 Check the dynamic edges of the built client: the chart and map libraries load only from a Specials page,
      the code highlighter only from a Topic Post with a colored block, and neither through the lazy chat panels.
      Verify: the chunk graph script's output is recorded in design.md
- [ ] 3.6 Import `posthog-js` after hydration, queue page views and events until it starts, and keep the MCP build's
      alias exporting the same names. Verify: `visitAnalytics.test.ts` shows the first page view and a page's
      first event sent in order, and the entry chunk holds no analytics library
- [ ] 3.7 Set the router's default preload to intent. Verify: a test that hovering a public link runs no api
      request, and that the signed-in gate and the team Specials route still behave under a preload
- [ ] 3.8 Add optional `audioUrl` and `video` to the podcast episode summary contract, filled with the counted route
      paths, never a stored file's url. Verify: the contract test, the freeze check, and a test that a summary's
      play url still counts its play
- [ ] 3.9 Set the loading state and the media element's source inside the press, read the full podcast episode
      beside it, and never assign a source that is already set. An MCP view keeps its tokenized urls and its
      read-first path. Verify: a test that a press sends one request to the counted route, that a later full read
      does not send a second, and that no page load fetches a counted audio or film route before a press
- [ ] 3.10 Record each route's chunk sizes with the chunk graph and route closure scripts, unchanged, after the
      build. Verify: the before and after tables are in design.md
- [ ] 3.11 Docs: `apps/web/AGENTS.md`. Verify: the lazy loader pattern and the press are named

## 4. Findings

- [ ] 4.1 (finding R17) Serve the home's hero image as a webp at two widths. Verify: the home's largest paint on a
      phone loads the small one

## 5. Integration checks

- [ ] 5.1 `bun run check` is green
- [ ] 5.2 Lighthouse on the home, a topic page, and a Topic Post, with the command in A.19 unchanged, three runs a
      page, on the built ui. Verify: the after reports are kept beside the before ones in
      `logs/launch-hardening/research/lighthouse/`, and design.md records
      both medians
- [ ] 5.3 On a phone and in a simulator: a signed-in cold load of the home, a film card's play, a podcast episode
      card's play, the chat pill, and the New Topic button. Verify: no flash of the visitor's page, sound starts
      on the press, and each dialog opens without a wait

## Workflow follow-up

- Ship through `/ship` after `launch-hardening-page-reads` is archived, which archives this change with
  `openspec archive launch-hardening-browser-load --yes`.
- After the push: run the film image backfill.
