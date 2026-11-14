## 1. One Team rule for the Café and the news

- [x] 1.1 `apps/api/team/memberTeamTopics.ts`: the person's active Team ids, led alone or every one, and public Teams
  that show the membership alone for anyone but the person and an admin, and the filter of the Topics those Teams hold
- [x] 1.2 The Café's tiles and the person's table read through it, and leave out a private Topic another member owns
  until its Personal sources text is converted
- [x] 1.3 The news's team group reads through it
- [x] 1.4 Tests for the hidden membership and the unconverted private Topic

## 2. Whose Topic

- [x] 2.1 `ownerTopic` and the profile's `topic` gain `owner` and `team`, read in `topic/topicOwners.ts`, with
  `toTeamIdentity` shared beside `toProfileIdentity`
- [x] 2.2 The Owner column in `toOwnerTopicsTableColumns` and `toTopicsTableColumns`, on a profile's tables alone, with
  each app's team and profile link elements
- [x] 2.3 Fixtures, stories, and tests

## 3. The default team

- [x] 3.1 `toTeamChoices` labels the default team's option
- [x] 3.2 `useTopicTeamChoice` shows a message when a save adds the default team
- [x] 3.3 Tests

## 4. Admin view

- [x] 4.1 The news read treats an admin's read as the person's
- [x] 4.2 The opener's cache key in one helper, and `GET /api/profiles/:userId/opener` for admins from the cache alone
- [x] 4.3 The client read, and both apps' profiles read it for an admin
- [x] 4.4 The news card's highlighted user and visitor view select on both apps, which changes the whole profile
  through the profile route's and the profile news route's `audience`, which starts again on another profile
- [x] 4.6 `profileReader.ts`: an admin reads the person's own Topics but an unconverted private one, in the tiles,
  the news, and the stored opener
- [x] 4.5 Tests, the contract fixtures, and the smoke checks

## 5. Docs and checks

- [x] 5.1 The AGENTS.md files and the docs that describe the Café, the news, and the Team field
- [x] 5.2 `bun run check`
