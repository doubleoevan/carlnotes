## 1. The badge data

- [x] 1.1 Add `TopicInviteBadge` to `shared/contracts.ts`: the invite id, the topic id and name, and the inviter's username.
- [x] 1.2 Export `loadInvitedTopicSubscriptions` from `api/activity.ts` and add `GET /invites/topics/pending` to `api/invite/userInvites.ts`, mapping its rows to `TopicInviteBadge[]` and rejecting a visitor with 401.
- [x] 1.3 Add `fetchTopicInviteBadges` to `ui/src/clients/activityClient.ts` and `ui/src/stores/topicInviteStore.ts` with `setTopicInvites` and `useTopicInvites`.

## 2. Where it shows

- [x] 2.1 Add `toTopicInviteLabel`, `toTopicInviteLines`, and `TooltipSection` to `UpdateCountBadge.tsx`, the body a bulleted list of "{user} invited you to subscribe to {topic}" with the first four listed, the rest counted, and the names bold. Share one `TooltipSection` across the chat, note, and invitation tooltips so every one is a heading over bold-named bullets.
- [x] 2.2 Add `UpdateCountBadge` and `toUpdateLabel` to `UpdateCountBadge.tsx`, one count over any mix of chat mentions, note badges, and invitations with the combined tooltip, and use it for the avatar, the mobile menu button, every row of `UserMenu.tsx`, the Activity page's title in `ActivityPage.tsx`, the profile page's avatar, the Teams title, the the chat button, and `PageUpdateCountBadge` on every topic or team name, naming the waiting groups in the avatar trigger's label. Drop `CountBadge`'s outline variant so one filled style remains.
- [x] 2.3 Add the count to the tab title's leading number in `usePageTitle.ts`.
- [x] 2.4 Read it in `AppChatPanel.tsx`'s badge poll, and re-read it in `TopicSubscriptionsTable.tsx` after an accept or a decline.

## 3. Verification and docs

- [x] 3.1 Test the label and the tooltip bullet in `UpdateCountBadge.test.tsx`.
- [x] 3.2 Say so in `docs/src/content/docs/feed/reading-your-feed.md` beside the Activity page's subscriptions, and run `bun run docs:embed`.
