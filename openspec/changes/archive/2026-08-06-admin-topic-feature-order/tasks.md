## 1. The ordering rules

- [x] 1.1 Add `api/topic/featuring.ts` with `setTopicFeatureOrder(topicId, position)`: refuse a missing or non-public Topic, then in one transaction release the Topic from the ordering, and when the position is non-zero increment every Topic at and after the target and write the position. It returns which rule refused so the route can map it to a status.
- [x] 1.2 Add `releaseFeatureOrder(topicId, handle)` in the same file for the delete and visibility paths, taking the caller's transaction so the release commits with them.
- [x] 1.3 Add `toTargetPosition(position, featuredCount)`, clamping the offered append position to the end of the ordering the Topic is joining. Without it a Topic moving to the end leaves a gap where it used to be.
- [x] 1.4 Add `loadFeaturedTopics()` returning the featured Topics in order with their names, which is what the menu lists.
- [x] 1.5 Unit-test `toTargetPosition` in `api/topic/featuring.test.ts`. The shifts themselves are SQL in a transaction and this suite has no database-backed tests, so a pure model of them would be a parallel implementation testing nothing — they are verified live in group 5 instead.

## 2. The admin route

- [x] 2.1 Add `topicFeatureOrderPayload` to `shared/contracts.ts`, a non-negative integer position. No upper bound, since the server clamps.
- [x] 2.2 Add `featureOrder` and `featuredTopics` to `topicResponse`, both nullable, populated in `loadTopicPayload` only for an admin. Extracted into `toTopicFeaturing` so `loadTopicPayload` stays under the cognitive-complexity limit.
- [x] 2.3 Add an `admin:setFeatureOrder` capability to `api/authorization.ts` alongside the other admin-only ones.
- [x] 2.4 Add `PATCH /topics/:id/feature-order` in `api/index.ts`, refusing a signed-out caller with 401, a non-admin with 403, a missing Topic with 404, and a Topic that is not public with 409.

## 3. Releasing on delete and visibility change

- [x] 3.1 Wrap `deleteTopic`'s delete in a transaction and release the feature order inside it.
- [x] 3.2 Call the release inside `updateTopic`'s existing transaction when the payload's visibility is not public.

## 4. The Rank control

- [x] 4.1 Add `ui/src/components/topic/TopicRankButton.tsx`: reads `Rank: <position>` or `Rank`, carries the "Set feature order" tooltip, and lists one row per featured Topic with its position and truncated name, then a `New topic` row for the position past the end.
- [x] 4.2 Mark the row holding the Topic being viewed with a check, so its own place in the section is visible without reading the names.
- [x] 4.3 Disable the `New topic` row when the Topic is already featured, since its own numbered row already covers every placement including last.
- [x] 4.4 Give every named row an × that clears the feature order of the Topic on that row, which is also how the Topic being viewed leaves the section.
- [x] 4.5 Close the menu on any change, then reload the topic page and the homepage feed so the control and the Featured ordering both follow.
- [x] 4.6 Render the control in the topic page's control row between the sort control and the follow and brew group. The admin-and-public check lives in the control itself, which keeps `TopicPage` under the cognitive-complexity limit and puts the rule beside what it governs.

## 5. Verification

- [x] 5.1 `bunx biome check .`, `bunx tsc -b`, `bun test`.
- [x] 5.2 Live: inserted a Topic at position 2 of 3 and confirmed the two below each moved down one; the control then read `Rank: 2` and the menu had closed.
- [x] 5.3 Live: cleared position 1 with its × and confirmed the Topic left the section and everything below moved up one, leaving the orders contiguous from 1.
- [x] 5.4 Live: made a featured Topic private and confirmed it was released and the Topic below moved up; deleted a ranked throwaway Topic and confirmed the same.
- [x] 5.5 Live: read the menu's DOM on a ranked Topic (`aria-pressed="true"` on its own row, `disabled: true` on `New topic`) and on an unranked one (`New topic` enabled, no marked row).
- [x] 5.6 Live: confirmed an anonymous payload carries `featureOrder: null` and `featuredTopics: null`, and that the route refuses an unauthenticated call with 401.
- [x] 5.7 Live: confirmed a signed-out visitor's Featured section shows every ranked Topic in order, including ones owned by the signed-in admin, which their own feed hides under "Your topics".
