## Why

A topic's latest Coffee Break episode plays only from the topic page. The homepage shows the same findings with no
sign of the episode that covers them, the topic roast says nothing about the podcast, and a finding's note never says
which chapter covers it. A listener has to open the topic first to find the episode at all.

## What Changes

- The homepage feed includes each topic's latest published episode that the user may listen to, with its chapters. The
  topic page reads the same field, in place of its own copy under the podcast. The feed still assembles in a fixed
  number of queries.
- A narrated finding's chapter pill shows wherever the finding shows: the homepage rows, the topic page rows, and every
  finding note, on the homepage, the topic page, and a chapter's row. The pill ends in a small play icon, a pause icon
  while its chapter plays.
- A play button sits to the left of every topic note icon, on the homepage and in the topic page heading. Its tooltip
  names the Coffee Break podcast over the episode's season and number, its title in bold, and its date, length,
  chapter count, and AI voices note.
- The topic roast popover shows the latest episode's row above Carl's Prompt, the same row as the episodes card
  without the remove button.
- The skip back, skip forward, and playback speed buttons get tooltips: "Skip back 15 seconds", "Skip forward 30
  seconds", and "Playback speed". The small player at the bottom of the screen gains skip forward beside skip back.

## Capabilities

### New Capabilities

### Modified Capabilities

- `feed-api`: the feed includes each topic's latest podcast episode
- `podcast-episode-player`: the chapter pill on every finding and note, the play button beside the note icon, the
  episode row in the topic roast, and the skip buttons' tooltips

## Impact

- `shared/contracts.ts`: `latestPodcastEpisode` moves from `topicPodcast` to `topicFeed`.
- `api/podcast/helpers.ts`, `api/topic/feeds.ts`, `api/topic/topics.ts`, `api/topic/helpers.ts`, and
  `api/topic/permissions.ts`: the batched latest episode read and its access check.
- `ui/src/components/podcast/` and `ui/src/components/topic/`: the shared episode row, details, play button, skip
  buttons, finding list, and chapter pill.
- The Coffee Break docs page.
