## Why

A topic page shows one film at a time: Coffee Break Cinema holds a large player with the latest film, and a separate
Coffee Break films list pages each season's films five rows at a time. A visitor sees one film, not the topic's
collection, and the player and the list repeat each other. The home page already shows films as paged cards that open
the Video dialog, and the topic page should show its own films the same way.

## What Changes

- Coffee Break Cinema on the topic page shows every ready film of the topic as paged film cards, six to a page, newest
  first, laid out as the home page's Featured films section. A card's play button opens the Video dialog.
- The large film player leaves the topic page, with its "New film ready" button and its rows that played into it.
- The Coffee Break films list by season leaves the topic page.
- While the topic's latest film renders, Coffee Break Cinema shows the filming card above the cards and the page reads
  again until the film is ready, then the new film shows as the first card.
- The topic read returns the topic's film cards in a new optional field. The fields and the season route that shipped
  mobile builds read stay.
- A topic film card's dialog open reports a new `topic-videos` surface. The films list's page event leaves.
- The podcast episode page's specs catch up with a shipped change: its film section reads "Coffee Break Film" and sits
  above Coffee Break podcast.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `topic-video-player`: the topic page's film section holds film cards instead of a player, the Coffee Break films list
  leaves, and the podcast episode page's film section is named Coffee Break Film and leads the page.
- `topic-video-featuring`: the topic page's film section is the one that sits before Coffee Break podcast episodes, and
  the podcast episode page leads with its film.
- `topic-video-rendering`: a failed render leaves no card in Coffee Break Cinema instead of no row in Coffee Break
  films.
- `monitoring-analytics`: the `topic-videos` surface joins the Video dialog's surfaces, and the films list's page event
  leaves.

## Impact

- API: `apps/api/podcast/helpers.ts` builds the topic's film cards with the home's card loader. `apps/api/topic/` and
  `packages/contracts/topics.ts` add the optional field.
- Shared: `packages/core/components/TopicVideoSection.tsx` holds the cards, and `topicVideoSectionStore.ts` with the
  films list's pieces go.
- Web and mobile: the topic page's film section, the films list in `PodcastEpisodesCard`, the topic route's film season
  read, stories, tests, the skeleton, and `apps/mobile/parity.md`.
- Analytics: `packages/contracts/visitAnalytics.ts` and `analyticsEvents.ts`.
- Released mobile builds keep reading `topicPodcastEpisodeVideoSection` and the season route with `hasVideo`.
