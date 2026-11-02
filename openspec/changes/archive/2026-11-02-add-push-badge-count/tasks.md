## 1. Shared counts

- [x] 1.1 Move the note badge reads to `packages/db/noteBadges.ts` and export `loadBadgedPages`
- [x] 1.2 Move `loadUserEmail` and `toInviteAddressedToUserFilter` to `packages/db/inviteFilters.ts` and add
  `toPendingTopicInviteFilter`, which `apps/api/activity.ts` reads through
- [x] 1.3 Add `packages/db/updateCounts.ts` with `toUnseenChatMentionFilter`, which `apps/api/chat/mentions.ts` reads
  through, and `loadUpdateCount`

## 2. Push badge

- [x] 2.1 Add `badge` to `PushTarget` and set it on each push message
- [x] 2.2 Load each recipient's update count once per account in `deliverPushes`, per chunk and after the phones an
  earlier attempt reached are left out, leaving the badge out for a count that fails to load
- [x] 2.6 Load a user's badged pages once for both the chat and the note counts
- [x] 2.7 Add the partial index `room_mentions_unseen_user_id_idx` on unseen mentions by user
- [x] 2.3 Test that each phone gets its account's count and a recipient with nothing waiting gets 0
- [x] 2.4 Count a Topic the Team owns as held when a mention push checks the room, as the api's room access does
- [x] 2.5 Cast the author id in the mentioned members' block check to text, which Postgres needs to type `$n is null`

## 3. Docs

- [x] 3.1 Update the db, api, and pipeline AGENTS.md files
