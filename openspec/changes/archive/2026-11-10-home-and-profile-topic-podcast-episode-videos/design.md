## Context

See proposal.md for why. This section covers only the current state that shapes the approach.

- **Home.** `packages/core/lib/homeFaces.ts` defines `HOME_SECTIONS` in display order, keyed by the home payload's
  fields: `homeTopics`, `homePodcastEpisodes`, `newestPodcastEpisodes`, and `yourTopics`. Both apps render them through
  one card section with six cards a page (`HOME_CARDS_PAGE_SIZE`), at most 12 home items, and 7 days for new podcast
  episodes. They come from one cached query in `apps/api/home/homeRoute.ts`. Code says home, never featured. Copy says
  Featured topics, Featured podcasts, and New podcasts this week.
- **Home picks.** `episodes.homeOrder` (the `feature_order` column) is set through `setHomeOrder` in
  `packages/db/homeOrder.ts`, generic over a table. An admin sets it from the podcast episode page's action menu
  ("Featured podcasts"), in `apps/api/podcast/podcastEpisodeHomeOrder.ts`.
- **Café (row 61, not merged).** `topics.profile_order` and `episodes.profile_order`, owner-set, at most 12, contiguous,
  released if a Topic leaves the public set. The Café shows Featured Topics, then Featured Podcasts, through a shared
  `CardsSection` and a rank dialog both apps render. `social_profile_order_change` reports pin changes.
- **Row 62 (planned beside this one).** It adds `topic_podcast_episode_videos`, the `hasVideo` flag on podcast episode
  summaries, `TopicPodcastEpisodeVideoDialog`, and the `visit_episode_video_dialog_opened` event with a `surface`.

## Goals / Non-Goals

**Goals:**

- Reuse the home and Café section, card, pagination, and rank dialog components with a film kind, never a copy.
- One order rule for film and podcast sections, stated once, followed everywhere.

**Non-Goals:**

- The MCP Café and directory views, and in-host film playback. Row 64 builds them, and this change leaves the data and
  components ready for them.
- A films section on the `/topics` directory page, which shows no podcast section today.
- Ranking films by film plays alone.

## Decisions

### Approved

The first three were asked for in the brief. The fourth came up while writing the copy. The user approved all four as
written on 2026-11-09, so the home says "Featured films" and "New films this week", and the Café says "Featured Films".

**1. The film card is a variant of `PodcastEpisodeCard`, with the film's image and a play button that opens the
film.**

- Core `PodcastEpisodeCard` gains `variant: "audio" | "video"`. The video variant opens the Video dialog from its
  play button, and keeps the same title, Topic, date, and length.
- The Nightshift card contract gains the variant, so both apps' adapters cover it.
- The user asked on 2026-11-10 for "film gets film image in card" and "instead of watch button lets have play button
  on card". The card first showed the podcast episode's image and a highlighted Watch button.
- **The image.** The podcast episode summary gains the optional `videoPosterUrl`, the url of a ready film's own image.
  `loadPodcastEpisodeSummaries` already reads each ready film's image hash in its one film query, so no card read gains
  a query. The film card shows it through `toTopicPodcastEpisodeVideoImageUrls`, in the card's own 3:2 frame, which
  crops the 16:9 image to cover it. A film with no image of its own, and every podcast card, keeps the podcast
  episode's image.
- **The play button.** The video variant draws each app's `PodcastEpisodePlayButton` at the film player's size,
  under the label "Play film", through the card size of `PodcastEpisodeVideoButton`. `isHighlighted`, which only Watch
  used, is gone. The button shows play at all times, with no pause state while the film plays in the dialog.
- **Over the image.** The user asked on 2026-11-10 for "play button over image on card". The button sits centered in
  the 3:2 frame of the card's image, as the film player's sits over its poster, and the title row holds only the title.
  It is the card's last child, so it follows the title's link in focus order, and each adapter places it over the
  image. Only the button takes the press, so the image around it still opens the podcast episode's page. A podcast
  card keeps Play beside its title.
- **A play press plays.** The dialog that the card opens plays the film once the podcast episode loads. The load is a
  fetch, so the play starts after the press. A browser that refuses a play that late, as Safari on an iPhone may,
  rejects it. The dialog then unloads the film, so it shows the poster with its play button and no error line. Chromium
  plays. Safari on an iPhone is not checked.
- Alternative: a separate `TopicPodcastEpisodeVideoCard`. It would copy every line of layout for a one-button
  difference, and the parity check would then need both kept in step forever.

**2. Film picks live beside the existing picks, as `home_order` and `profile_order` columns on
`topic_podcast_episode_videos`.**

- `setHomeOrder` already takes a table, so home picks need no new write code. Row 61's profile order write takes the
  same table argument.
- The pick belongs to the film, not to the podcast episode. A podcast episode can be featured as a podcast and not as a
  film, or the reverse.
- Removing the film's row, or its podcast episode, releases both orders. Leaving the public set releases the profile
  order, by row 61's rule.
- Alternatives: reusing `episodes.home_order` would tie the two lists together. A separate picks table would add a join
  and a second ordering scheme for the same idea.

**3. The fallback is the home podcasts' rule, applied to podcast episodes that have a film.**

- The home's Featured films lists the picks in order. It then lists the published podcast episodes of public shown
  Topics that have a ready film, by listener count, one per Topic, until 12.
- The Café's fallback follows row 61's Featured Podcasts rule the same way, over the person's podcast episodes that
  have a film.
- The listener count is the podcast episode's own, which row 62 counts across both formats.
- Alternative: ranking by film plays alone. A new film format would start every podcast episode at zero, and the
  shelf would rank noise for weeks.

**4. Copy casing follows the neighbouring sections.**

- The brief writes "Featured Films" and "New Films This Week". The home's sections read "Featured topics", "Featured
  podcasts", and "New podcasts this week" in sentence case. Row 61's Café headings are written "Featured Topics" and
  "Featured Podcasts".
- Recommendation: one casing per page, matching its neighbours. The home says "Featured films" and "New films this
  week", and the Café says "Featured Films". If you prefer the brief's casing everywhere, the home's two podcast
  headings change with it, in this change.

### The rest of the approach

**Home payload.**

- The payload gains `homeTopicPodcastEpisodeVideos` and `newestTopicPodcastEpisodeVideos`, both `PodcastEpisodeCard[]`
  read from the same cached query.
- `HOME_SECTIONS` inserts them before `homePodcastEpisodes`. Since both homes iterate `HOME_SECTIONS`, the order rule
  holds by construction.
- New films this week holds the films of public shown Topics whose podcast episode published in the last
  `NEW_PODCAST_EPISODE_DAYS` and whose film is ready, newest first. A film that finishes rendering an hour after its
  podcast episode joins on the next cache refresh, and leaves 7 days after the publish.

**Admin picks.**

- `topicPodcastEpisodeVideoHomeOrder.ts` sits beside `podcastEpisodeHomeOrder.ts`, with the same rules. Only an
  admin may pin, only a ready film of a public shown Topic, and position 0 clears.
- The podcast episode page's action menu shows Home films for an admin, if the podcast episode is on a public Topic
  and has a ready film. It opens the same rank dialog with the film list.

**Café.**

- Row 61's profile order route and rank dialog take a third kind, `topicPodcastEpisodeVideo`, with the same limit of
  12, conflict rules, and edge purge.
- The Café payload gains the Featured Films cards, and the Café's section list puts the section before Featured
  Podcasts.

**Team page.** The user asked on 2026-11-10 that a team page get the Café's sections.

- The team page payload gains the optional `topicPodcastEpisodeVideoCards`, and `TEAM_SECTIONS` in
  `packages/core/lib/cardSections.ts` puts Featured Films right before Featured Podcasts, under the Café's titles.
  Both apps render it through the same card section over the film card, with the `team-videos` analytics value.
- The films follow the team's Featured Podcasts rule. A team has no pins of its own. Its cards are those of the Topics
  the reader may open, which are every held Topic for a member or an invited user and the public ones for anyone
  else. The films their Topics' owners pinned on their Cafés lead, then the most listened one of each other Topic.
- `apps/api/team/teamPage.ts` reads them through the Café's film read, `loadProfileTopicPodcastEpisodeVideoIds`, and
  the batched card read, so the page reads them in a fixed number of queries however many films it lists.
- No Featured films option on the team page's action menu, since the team's podcasts have none either.
- Alternative: pins of the team's own, set by its leaders. It would add an order column per team and Topic, a route,
  and a dialog for a list the owners already order on their Cafés.

**Order rule in one place.** `packages/core/lib/sectionOrder.test.ts` holds the pairs (`homeTopicPodcastEpisodeVideos`
before `homePodcastEpisodes`, and the Café's, the team page's, and the topic page's pairs) and asserts that each page's
section list and both apps' page files keep them. The podcast episode page is the one exception: its podcast section
comes first and its film section after it, which the same test asserts. `Layout.mdx` in the Nightshift Storybook
states the rule and the exception for people.

**Analytics.**

- `episode_video_home_order_change` has `podcastEpisodeId` and `position`, sent by the admin route.
- `social_profile_order_change` gains the `topicPodcastEpisodeVideo` kind.
- Row 62's `visit_episode_video_dialog_opened` takes four `surface` values from the film cards: `home-videos` in the
  home's Featured films, `newest-videos` in New films this week, `profile-videos` in a Café's Featured Films, and
  `team-videos` in a team page's. Row 62 sends the other three, `home-news`, `profile-news`, and `topic-info`.

**Platform deviations.** None. Both apps render the same core section and card, and the rank dialog is already shared
by row 61.

## Risks / Trade-offs

- [Row 61's profile code is not on main] → The Café tasks are written against row 61's change. They run after the
  rebase, and the home tasks run now.
- [Row 62 is not on main either] → This change's code starts from row 62's branch. Until row 62 lands, its tests use
  row 62's fixture rows.
- [Early on, few films exist, so Featured films would echo Featured podcasts] → It holds only films, and a section
  with none is hidden. The home simply shows fewer cards at first.

## Migration Plan

1. Build the home sections, the card variant, the admin pick route, and the Layout page now, on top of row 62's code,
   with unit tests and stories only.
2. After rows 61 and 62 merge: rebase, generate the migration after theirs, add the Café kind and section, and run end
   to end.
3. Deploy after both rows are live. Rollback is a code revert. The two new columns are nullable and unused by older
   code.
