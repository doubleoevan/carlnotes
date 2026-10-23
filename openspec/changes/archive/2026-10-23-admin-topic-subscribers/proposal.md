## Why

An admin sees how many people follow a topic in the console's topics subtable, but not who they are. Answering "who
follows this topic" today takes a database query.

## What Changes

- In the admin console's topics subtable, a topic's follower count opens a table of its followers beneath the topic row.
  In the users table's order, each row shows the follower's avatar and username linking to their profile, their email
  linking to their activity page and their plan linking to their account page, their signup date, and last login, then
  when they followed, whether the topic's emails reach them, how many of its emails they received, and when it last
  emailed them.
- The followers load when the count is opened, through a new admin-only route, `GET /api/admin/topics/:id/subscribers`.
- The followers are the people the count counts: active subscriptions, never the owner's own. The count and the list
  share one rule.
- A topic row opens one subtable at a time: its scan costs or its followers.
- The owner's own topics table, on their profile, keeps a plain follower count.
- The users table's avatar and username, email, and plan links, and the team members table's avatar and username
  link, become the shared `UserNameLink`, `UserEmailLink`, and `UserPlanLink`, which the subscribers table uses too.
- The admin page drops the divider line between its Users and Teams sections.
- A subtable nested inside another subtable, such as a topic's subscribers under a team's topics, flips back to the card
  fill, so it reads apart from the sunken subtable it sits in. `TableCard` gains a `data-slot` that the table's rule
  targets.
- No release note: the change is admin-only.

## Capabilities

### New Capabilities

### Modified Capabilities

- `admin-console`: a topic's follower count in the console's topics subtable opens that topic's followers.

## Impact

- `apps/api`: `admin.ts` (the route), `adminConsole.ts` (the loader), `topic/subscriberCounts.ts` (the shared rule), and
  `activityTopics.ts` (the topics table's count, through the same rule).
- `packages/db`: an index on `topic_email_sends (topic_id, recipient_user_id, sent_at)` in `schema/topics.ts`, and
  migration `0121`.
- `packages/contracts/admin.ts` (`AdminTopicSubscriberRow`), `packages/client/billingClient.ts`
  (`fetchAdminTopicSubscribers`).
- `apps/web`: `OwnerTopicsTable.tsx`, a new `TopicSubscribersTable.tsx`, a new `UserLinks.tsx`, the scan costs table
  moved into `TopicScansTable.tsx` to keep the topics table under 400 lines, `AdminUserRows.tsx`,
  `TeamMembersTable.tsx`, and `AdminPage.tsx`.
