## Why

Row 62 gives each new podcast episode a film, but a film can only be found on its Topic's page or behind a Video button.
The home page and a person's Café are where people browse, and both already feature podcast episodes. This change gives
films the same shelf space, above the podcasts, so the newer format leads. It applies after row 62
(`topic-podcast-episode-videos`) and row 61 (`cafe-brews-news-open-mic-mentions`). It builds now, and its conflicts are
resolved at the rebase.

## What Changes

- **Home page.** Two collapsible sections of film cards sit right before the home podcasts. Featured films lists the
  admin's picks, then the fallback. New films this week lists the films of public Topics published in the past 7 days,
  newest first. Both page by six like the home sections and keep every card in the server's HTML. A section with no
  film is hidden.
- **Admin picks.** The podcast episode page's action menu gains Home films for an admin, on a public Topic's podcast
  episode that has a film. It opens the same rank dialog as Home podcasts.
- **Café.** A collapsible Featured Films section sits right before Featured Podcasts. The owner picks up to 12 films
  from the Café's action menu, as with Featured Topics and Featured Podcasts. The section lists the picks, then the
  fallback, paging through all of the person's films. It is hidden if they have none. Anyone but the person sees films
  on public Topics only.
- **Team page.** A collapsible Featured Films section sits right before Featured Podcasts on a team page. It lists the
  ready films of the team's Topics that the reader may open: the films their owners pinned on their Cafés first, then
  the most listened film of each other Topic. A team has no pins of its own.
- **Film card.** A film card is a variant of the podcast episode card, with the film's own image and the film
  player's round play button centered over it, which opens row 62's Video dialog on web and its full-screen sheet on
  mobile and plays the film. The Topic's owner also pins the film from its podcast episode page, with Featured films
  right above Featured podcasts in the action menu.
- **Order rule.** Film sections always sit right before the podcast sections they pair with: on the home page, on the
  Café, on a team page, and on the topic page. The podcast episode page is the one exception, where the podcast's
  section comes first. The rule is written down for every future page.
- **Analytics.** PostHog events hold ids only: featured film pick changes, and film card opens tagged by section.
- **Docs.** The domain model gains featured film picks. A Nightshift Layout page in Storybook states the
  films-above-podcasts order. The Persona & Voice page gains the home's Featured films and New films this week copy
  and the Café's Featured Films.
- **MCP.** The Café view and the directory view are not built yet. Row 64 ("MCP parity") adds both, together with
  in-host film playback. This change puts the film sections in the shared payloads and the core section components,
  so row 64's views render them in the same order. A film card's play button, labeled "Play film", then follows row
  64's playback switch, falling back to a link to carlnotes.com. No MCP view changes here.

## Capabilities

### New Capabilities

- `topic-podcast-episode-video-featuring`: the film card, the home's Featured films and New films this week, the
  Café's and the team page's Featured Films, the admin and owner picks with their fallbacks and their limit of 12, and
  the films-above-podcasts order with the podcast episode page's exception.

### Modified Capabilities

- `home-page`: the home payload and both faces include the two film sections before the podcast sections.
- `monitoring-analytics`: the featured film pick events, and the section that a film card's open names.
- `public-profiles`: the Café's fixed section order gains Featured Films between Featured Topics and Featured
  Podcasts. The requirement comes from `cafe-brews-news-open-mic-mentions`, which archives first.

## Impact

- **Schema** (`packages/db/schema/podcast.ts`): `topic_podcast_episode_videos.home_order` and `.profile_order`, beside
  the same columns on `episodes`. One migration, numbered after rows 61 and 62.
- **API**: `apps/api/home/homeRoute.ts` and its cached home query gain `homeTopicPodcastEpisodeVideos` and
  `newestTopicPodcastEpisodeVideos`. A video home order route sits beside `podcastEpisodeHomeOrder.ts`. Row 61's profile
  order routes and the Café payload gain the film kind. `apps/api/team/teamPage.ts` fills the team page's film cards.
- **Contracts** (`packages/contracts/home.ts` and row 61's profile contracts): two optional film card lists, so released
  mobile versions keep reading.
- **Shared UI** (`packages/core`): `HOME_SECTIONS` gains the two film sections in order. `PodcastEpisodeCard` gains its
  video variant. Row 61's `CardsSection` and rank dialog take the film kind.
- **Web and mobile**: the home page and screen, the Café page and screen, the team page and screen, and the podcast
  episode page's action menu.
- **Docs**: the domain-model skill and its Notion table, `apps/web/src/nightshift/Layout.mdx`, and the Persona & Voice
  page.
