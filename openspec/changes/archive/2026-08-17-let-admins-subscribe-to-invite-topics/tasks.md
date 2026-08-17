## 1. The subscription gate

- [x] 1.1 In `api/topic/subscriptions.ts`, have `setTopicSubscription` ask `isAllowed(userId, "topic:view", topic)` instead of `canSeeTopic` directly, keeping the private-Topic and own-Topic guards above it untouched
- [x] 1.2 Drop the now-unused `canSeeTopic` import if nothing else in the file uses it

## 2. Verification

- [x] 2.1 `bunx biome check .`, `bunx tsc -b`, and `bun test` all clean
- [x] 2.2 Followed "Agent infrastructure weekly", an invite Topic owned by another user whose invites name two other addresses: the page confirmed the subscription with the next-brew line, the row landed active with email off, the Topic's subscriber count went 0 to 1, and a subscribe posted at a private Topic owned by someone else still answered 403
