## Context

The topic page shows its films twice: Coffee Break Cinema holds a player for the latest film, and Coffee Break films
lists each season's films, whose rows play into that player through `topicVideoSectionStore`. The home, a Café, and a
team page show films as paged cards through the shared `PagedCardsSection` and `PodcastEpisodeCard`, whose play button
opens the Video dialog. The topic read already loads every published Podcast Episode of the Topic, newest first and
gated by access, and reads each one's ready and rendering film once (`loadTopicPodcast` in
`apps/api/podcast/helpers.ts`).

## Goals / Non-Goals

**Goals:**

- Coffee Break Cinema shows every ready film of the Topic as the home's film cards, paged six at a time.
- One film section on the topic page: the player, its store, and the films list go.
- The filming card and the page's reads while a film renders stay.
- Released mobile builds keep working.

**Non-Goals:**

- No change to the podcast episode page's film player, the Video dialog, or the audio player card.
- No paging on the server. The topic read returns every film card.

## Decisions

1. **The topic read returns the film cards in a new optional field, `topicPodcastEpisodeVideoCards`, on the topic
response.** It is built in `loadTopicPodcast` from the published rows that have a ready film, in their newest-first
order, through the home's `loadPodcastEpisodeCards`. The rows are already gated by access, and the card loader needs ids
the caller may show. The field sits on `TopicResponse` instead of `TopicPodcast` because `contracts/podcast.ts` cannot
import the card from `contracts/home.ts`, which imports it. A second route was rejected: the section renders on the
server for a crawler, and the page would wait on a second read. 2. **Keep `topicPodcastEpisodeVideoSection` and the
season route's `hasVideo`.** The 0.1.0 snapshot in `contracts/` names both, and Edit film, the header's film count, and
the film feed url still read the field. 3. **The shared `TopicVideoSection` keeps its name and becomes the card
section.** It draws the core `CardsSection` pieces inside the topic page's collapsible section, so the title keeps its
theme song credits, the anchor `#film`, and the open-on-load behavior, and the cards keep the home's grid, cells, and
page buttons. The web's `PagedCardsSection` elements wrap an accordion item that needs the home's accordion, so the
topic page passes its own `Section` element and reuses the home's `Grid`, `Cell`, and `Pagination`. 4. **The filming
card sits above the cards while the Topic's latest Podcast Episode's film renders,** and the page reads again through
`useTopicVideoRenderingPoll`. The next read drops the card and adds the new film as the first card. The Video dialog
keeps its own state, so a film playing in it plays on. "New film ready" goes: no player plays an older film to protect.
5. **A topic film card reports `topic-videos`.** `visit_episode_video_section_toggled` stays on the section's toggle.
`visit_episode_videos_page_viewed` goes with the films list.

## Risks / Trade-offs

- **A Topic with hundreds of films sends every card with every topic read.** → The topic read already loads every
  published row. The cards add one query for the rows with their topic and one for the reactions, both by id. A
  `ponytail:` comment marks the limit and the upgrade path, paging on the server.
- **A shipped mobile build still shows the old player and list.** → It reads the kept field and route, so it works
  until the user updates.

## Migration Plan

Deploy the api and the web together. Nothing to backfill. Rollback is a revert: the old clients read the kept fields.
