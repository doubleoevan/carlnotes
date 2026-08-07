## Why

`topics.featureOrder` already decides the homepage's Featured section, and `api/topic/feeds.ts` already sorts by it — but nothing can set it. The only writer was a hard-coded map in `db/seed.ts`, so featuring a Topic in a real environment meant editing a seed file and re-seeding.

The column also had no invariant behind it. Nothing stopped two Topics sharing an order, nothing closed the gap when a featured Topic was deleted or made private, and nothing stopped a private Topic carrying an order no reader could ever see.

## What Changes

- A **Rank** control on the topic page, visible only to an admin and only on a public Topic. It sits between the sort control and the follow and brew group, reads `Rank: 2` when the Topic is featured and `Rank` when it is not, and carries the tooltip "Set feature order".
- The menu lists the Featured section as it stands: one row per featured Topic, naming its position and its Topic, truncated to the row. The row holding the Topic being viewed is checked, so its own place is visible at a glance.
- A final row offers the position one past the end, labelled **New topic**. It is disabled for a Topic that is already featured, whose own numbered row already covers every placement including last.
- Choosing a numbered row places this Topic there and pushes the rest down. Each named row also carries an **×** that clears the feature order of the Topic on that row — including this one, which is how a Topic leaves the section.
- Any change closes the menu, and both the topic page and the Feed's ordering follow it without a manual reload.
- Re-ranking a Topic that is already featured moves it: it leaves its old position, the gap closes, and it is inserted at the target. A target beyond the end lands at the end.
- Feature orders stay contiguous from 1, with no gaps and no duplicates. Deleting a featured Topic, or changing one to private or invite, clears its order and pulls everything below up one.
- Only a public Topic may hold a feature order. An admin-only route applies every change through the existing authorization gate, and refuses a Topic that is not public.

## Capabilities

### New Capabilities

- `topic-featuring`: who may set a Topic's position in the homepage's Featured section, what the menu shows and offers, and the invariant that keeps the positions contiguous, unique, and public-only across ranking, release, deletion, and visibility changes.

### Modified Capabilities

None. `feed-api` already reads `featureOrder` and sorts by it, and this change does not alter how the Featured section is assembled or rendered — including its existing rule that Featured and Popular exclude the viewer's own Topics.

## Impact

- **DB**: none. `topics.featureOrder` already exists and needed no migration.
- **API**: `api/topic/featuring.ts` holds the ordering rules; `PATCH /topics/:id/feature-order` applies them behind a new `admin:setFeatureOrder` capability; `loadTopicPayload` returns the Topic's order and the featured list for an admin; `deleteTopic` and `updateTopic` release an order when a Topic leaves the public set.
- **Shared**: the topic response gains `featureOrder` and `featuredTopics`, plus `topicFeatureOrderPayload` for the route.
- **UI**: `ui/src/components/topic/TopicRankButton.tsx`, placed in the topic page's control row, plus `sendTopicFeatureOrder` on the topic client.
- **Dependencies**: none. Reuses the existing popover, tooltip, and the admin session role the header already reads.
