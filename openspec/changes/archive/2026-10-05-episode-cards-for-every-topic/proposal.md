## Why

A Coffee Break episode link from an invite or private Topic showed no preview in a message, because its page answered a
link fetcher as missing. The Topic's own link previews with its card, so sharing an episode looked broken next to it.
The gate belongs on the page a person opens, not on the link preview.

## What Changes

- Every published Podcast Episode's page has its card in its head, whatever its Topic's visibility, and its card image is
  served for every published episode.
- A private or invite Topic's episode head has the card alone: `noindex`, with no canonical url, no structured data, no
  podcast feed, and no audio.
- A visitor, or a user who may not see the Topic, who opens one of its episode urls meets the Topic's gate, the same one
  the Topic's page shows, and logging in or signing up returns to the episode.
- The private Topic gate that the topic-detail-page spec already requires is restored: the api answers a private Topic
  as gated instead of missing, without its name, and the gate says the Topic is private and offers Log in alone.

## Capabilities

### New Capabilities

### Modified Capabilities

- `podcast-episode-pages`: every episode page has its card, and a non-public Topic's episode page is gated instead of
  missing
- `topic-detail-page`: a private Topic's name stays out of its gated page's content and the gated api answer, and the
  page's head keeps the Topic's card, as every Topic's page does

## Impact

- `api/share/pageHead.ts`: the episode head route serves any published episode, and the head builder leaves the search
  engine parts to a public Topic's episode.
- `api/podcast/podcastEpisodes.ts`: the card route serves any published episode, and the page route answers someone who
  may not see an invite or private Topic with the gate's 403, as the topic route does.
- `api/topic/helpers.ts` and `api/topic/topics.ts`: a private Topic is gated, with no name in the answer.
- `api/podcast/helpers.ts`: the any-visibility lookups are exported, and the public-only lookup, now unused, is removed.
- `ui/src/components/topic/TopicGateNotice.tsx`: the gate moves out of the topic page so the episode page shows it too,
  with its invite and its private copy.
- `ui/src/clients/podcastEpisodeClient.ts`, the episode route, and `PodcastEpisodePage.tsx`: the page says whether the
  episode is visible, gated, or missing. `readTopicGate` in `ui/src/clients/topicClient.ts` reads the gate for both
  the topic page and the episode page.
- `api/podcast/podcastEpisodes.smoke.ts` and `ui/src/clients/topicClient.test.ts`: the private gate, the topic gates,
  the card of a private Topic's episode, and the gate that both pages read are tested.
