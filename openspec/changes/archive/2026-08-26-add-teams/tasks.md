## 1. Usernames

- [x] 1.1 Add the unique index on `users.username_normalized` to `db/schema.ts`
- [x] 1.2 Grow the reserved list beside the username rules to the root-route inventory — login, join, api, topics, teams, admin, signup, reset-password, activity, account, plans, privacy, profiles, terms, blog, docs, pricing, and the static file names served at root — plus settings, t, and carl, reserved ahead of need
- [x] 1.3 Migration: add the unique index on `users.username_normalized`
- [x] 1.4 Route username assignment, availability checks, and username changes in `api/usernames.ts` and the signup hook through the unique index on `users.username_normalized`, keeping the 23505 race handling
- [x] 1.5 Cover username uniqueness across users in every casing, rejection of every reserved slug including the routes this change adds, and the grandfathering of an existing user whose name matches a newly reserved word

## 2. Teams schema and the audience drop

- [x] 2.1 Add `teams`, `team_members`, and the `team_topics` share join to `db/schema.ts` as the teams spec defines them, with a `teamRoles` enum of lead and member in `shared/enums.ts`, and a nullable `topics.team_id` for the owning team
- [x] 2.2 Migration: the three tables and the topic column
- [x] 2.3 Migration: drop `audiences`, `audience_members`, and `subscriptions.subscriber_audience_id` with its XOR check, and make `subscriber_user_id` NOT NULL
- [x] 2.4 Delete every audience branch the schema no longer supports: `api/authorization.ts` subscribed-ids, `api/topic/permissions.ts` subscription paths, `api/topic/feeds.ts`, `api/topic/subscriberCounts.ts` and its smoke fixtures, `api/activity.ts` rows and dedupe with their tests, `api/profiles.ts` follower coalesce, `worker/notify.ts` recipients, the `audienceName` contract field, and the read-only audience row treatment in `SubscriptionsTable.tsx`
- [x] 2.5 Update `db/seed.ts`'s recount SQL and `db/schema.test.ts`'s column assertions for the dropped scaffolding

## 3. The permission helper

- [x] 3.1 Add the effective-role resolver beside `canSeeTopic`: owner, team role through the holding teams — `topics.team_id` and the `team_topics` shares — or none, with query fragments for builders, consumed by `isAllowed`
- [x] 3.2 Resolve capabilities per the spec: reads for members, edits for owner and every member, attach, detach, membership, and the public toggle for leads, deletes and Scans for the owner alone
- [x] 3.3 Replace every inline ownership and visibility check the research inventoried — `api/topic/feeds.ts`, `topics.ts`, `attachments.ts`, `subscriptions.ts`, `featuring.ts`, `api/chat/turns.ts`, `api/profiles.ts` — with the gate or its fragments, deleting the old checks instead of leaving fallbacks
- [x] 3.4 Answer 404 for unauthorized reads and writes of private and team Topics, keeping the invite gate's named answer, and align the write routes that answer 403 today
- [x] 3.5 Keep team members on full Finding history, leaving the invite-visibility cutoff to the non-member subscribers it governs today
- [x] 3.6 Cover the helper's role matrix (owner, owning-team lead, shared-in member, outsider, private-topic visibility) in `api/team/teams.smoke.ts`; route-level 404-not-403 covered for rooms in `api/chat/room.smoke.ts`

## 4. Membership and delivery

- [x] 4.1 Write muted Subscriptions on join and on attach — active, email off, frequency copied from the Topic — inside the same transaction as the membership write, recounting subscribers
- [x] 4.2 Deactivate the member's Subscriptions on the Team's Topics when membership ends, in the same transaction
- [x] 4.3 Cover: joining writes one muted row per held Topic counting toward followers with nothing sent, and unsubscribing keeps access, in `api/team/teams.smoke.ts`; removal dropping private Topics is asserted through the visibility helper there

## 5. Invites gain the Team target

- [x] 5.1 Rename the table to `invites`, make `topic_id` nullable, add `team_id`, the exactly-one-target check, and the per-target unique address indexes
- [x] 5.2 Fork acceptance by target: a team invite writes membership plus the muted Subscriptions and opens the team page; creating one requires membership
- [x] 5.3 Update the topic-invite call sites the rename touches — `api/invite/invites.ts`, `topics.ts`, `subscriptions.ts`, `permissions.ts`, `activity.ts`, `db/quotas.ts`, seed — and the join page's landing
- [x] 5.4 Cover team-invite creation authority, acceptance writing membership with its refund at the member limit, and the topic-invite paths, in `api/invite/invites.smoke.ts`

## 6. Teams API and lifecycle

- [x] 6.1 Team routes: create, read, update name and description and avatar, the public toggle, membership management, promote, leave with the last-lead rule, attach making an owner or sharing in with the already-held rejection, detach ending that team's holding, delete with owned topics returned
- [x] 6.2 Limits per the quota pattern: members per Team from the best plan among leads and a daily creation limit, each admin-bypassed, checked before the write, answered 429
- [x] 6.4 Cover the last-lead rule, the member limit, and deletion returning owned Topics, in `api/team/teams.smoke.ts`

## 7. Team pages and entry points

- [x] 7.1 The team page at `/teams/:teamId` on the profile template: while private, outsiders get a gated 403 with the Team's name and a request-an-invitation action, members with the per-member opt-out and remainder count, topic table shared with the profile page plus a lead-only Active column, and lead controls
- [x] 7.2 The teams index at `/teams`: memberships with roles, the create control, and the only leave control
- [x] 7.3 The header menu Teams item directly below Profile, with the Lucide Users icon
- [x] 7.4 Team Up in the topic page action row, immediately left of Follow whether or not Follow renders: the attach menu on an unheld Topic, and on a held one a filled icon whose menu lists each led holding Team with a remove X and each other led Team as an add
- [x] 7.5 One create modal for both entry points — two lines on what a Team gives, attach-or-create, name prefilled from the Topic or suggested, the index variant adding a multiselect of the Topics the viewer may bring
- [x] 7.6 Derived attribution: the byline credits a public owning Team and links to the team page only when the viewer can reach it, the creator otherwise, on the topic page and every card
- [ ] 7.7 Cover the menu position, the action-row order for owner, member, and signed-in outsider — Team Up on unattached public and invite Topics, Follow alone on someone else's private one — the picker leaving out only what the team holds, the member-visibility opt-out and remainder, and the byline target for member, outsider, public Team, and private Team

## 8. Bookmarks on team Topics

- [x] 8.1 Widen bookmark creation from owner to the helper's access answer
- [x] 8.2 The Mine and Team scopes on a team Topic's Bookmarked view, Team rows showing the saver's avatar
- [x] 8.3 The prune exemption checks access: `filterTopicFindings` spares a Finding only while some bookmark holder still has access
- [x] 8.4 Cover both scopes, removal deleting only the user's row, and a departed member's bookmarks neither showing nor protecting

## 9. Signal capture, inactive

- [x] 9.1 Thumb rater identity: `rated_by_user_id`, `rated_team_id`, `rated_role` on `findings`, written when a rating is cast, cleared with it
- [x] 9.2 The feedback table and its popover input, stored verbatim against Finding and Topic
- [x] 9.3 The view-event table: opens and dismissals for marked-read-without-open
- [ ] 9.4 Cover that every capture writes what it should and that no feed order, prune decision, or score reads any of it — and that the room transcript reaches none of scoring, retrieval, or the context embedding either

## 10. The room

- [x] 10.1 Room message table with ordered bigint ids and a NOT NULL team column, a nullable author reference beside the author name recorded at post time (Carl's rows have his name and no account reference), a reply reference, encrypted content, and the per-room running summary table keyed by topic and team
- [x] 10.2 SSE stream with cursor resume, LISTEN/NOTIFY fan-out on a dedicated non-pooler connection, and the post route with its per-message length limit — the routes at `/topics/:id/rooms/:teamId`, each answering 404 through the helper, rejecting Topics no team holds
- [x] 10.3 The mention parser: one parser, Carl and member targets, no false positives inside longer tokens; the autocomplete listing Carl pinned first then current members; member mentions surfacing on the Activity page
- [x] 10.4 Carl's turn: wake on mention or reply-to-Carl only, budget checked before the completion, private refusal, per-room advisory lock, author usernames included in the model content, last thirty turns plus retrieval with the running summary, ledger row through `chat_turns` with the room message reference and token count
- [x] 10.5 The shared message component — avatar and display name on every message, raccoon art imported as a bundled asset — adopted by the solo Coffee talk, and the panel widened at large viewports with the message column limited
- [x] 10.6 The composer: placeholder teaching the mention
- [x] 10.7 Cover: parsing and silence (`shared/chatMentions.test.ts`), the autocomplete and rendering (`ui/src/components/chat` tests), mention rows, the room lock, budget refusal, the 404 matrix, and removal-with-messages-preserved (`api/chat/room.smoke.ts`). The ledger row, reply continuation, and cursor resume were verified live in the dev rooms, since each needs a real completion or a browser

## 11. House vocabulary

- [x] 11.1 Update both domain-model skill copies and AGENTS.md: Team, Username, and Room Message join the domain nouns with table rows, the feedback and view-event tables are listed under Finding's row, Audience leaves, Group and Cohort point to Team, Org and Workspace join the banned list, and the invites layering line follows the table rename
- [x] 11.2 Keep the usernames word-list test in step with the noun changes

## 12. Verification

- [x] 12.1 `bunx biome check .`, `bunx tsc -b`, and `bun test` all clean
- [x] 12.2 Walk the whole story on the dev servers with two accounts: create a Team from a Topic, invite the second account, watch the muted Subscriptions and follower counts, edit the Topic from both, talk in the room and wake Carl once, remove the member, and watch access end with the transcript intact
- [x] 12.3 Confirm the reserved list blocks every route this change added by trying each as a signup username
- [x] 12.4 Flip a Team public and confirm the byline, the team page, and the member-visibility opt-out all move together
