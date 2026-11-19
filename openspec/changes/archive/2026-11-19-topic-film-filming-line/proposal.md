## Why

While a Topic's newest film renders, the topic page's Coffee Break Cinema shows a full recording card above its small
film cards. The big card breaks the grid of film cards, and the section's title row already says what the section
holds. A short filming line in the title row says the same thing in less space.

## What Changes

- The topic video section shows "🎬 Carl and Vienna are filming..." with its shimmer at the right of its title row,
  right before the film count, while the Topic's latest film renders. The filming card above the cards goes away.
- If the title row runs out of room, as on a phone, the line wraps to its own line at the left, the way the profile
  page's button row wraps.
- A Topic with no ready film shows the section with its title and the filming line, and no cards.
- The podcast episode page keeps its filming card in Coffee Break Film.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `topic-video-player`: the topic video section says the hosts are filming with a line in its title row instead of a
  card above its cards.

## Impact

- `packages/core/components/TopicVideoSection.tsx`: the `RenderingCard` element becomes `RenderingLine`.
- Both apps' `TopicVideoSection.tsx` and `UnpublishedPodcastEpisodeCard.tsx`, which share the filming line's look.
- The web section test, the docs page, and the AGENTS and parity notes.
- No api, contract, or analytics change.
