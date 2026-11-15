## 1. Opener

- [x] 1.1 Add `readProfileUpdatesOpener` to `apps/api/topic/updates.ts`: null for an unconverted private Topic, else
  the person's home opener through `readUpdatesOpener`
- [x] 1.2 Route `GET /api/profiles/:userId/opener` to it and drop `readStoredUpdatesOpener`
- [x] 1.3 Move the guard test to `updates.test.ts` and update the route test
- [x] 1.4 Drop "stored" from the client, hook, stories, and AGENTS docs
