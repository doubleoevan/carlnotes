## Context

The console's teams and users tables open a topics subtable through `TopicsSubtableRow`, which renders the owner's
`OwnerTopicsTable`. Its Followers column reads `topic.subscriberCount`, which `updateTopicSubscriberCount` writes:
active subscriptions, never the owner's own. The cost cell opens a topic's scan costs from scans the payload already
includes. The other admin subtables load on first open through `GET /api/admin/...` routes gated by `admin:console`.

## Goals / Non-Goals

**Goals:**

- An admin opens a topic's followers from its count, loaded only when opened.
- The list always matches the count.

**Non-Goals:**

- Showing followers to a topic's owner or anyone who is not an admin.
- Unfollowing someone or changing their email preference from the console.

## Decisions

**One rule for the count and the list.** `apps/api/topic/subscriberCounts.ts` exports
`isActiveNonOwnerTopicSubscription`, the condition "active, and not the topic's owner". The recount counts the
subscriptions it matches, and the subscriber loader lists them, so the two cannot drift.

**The route.** `GET /api/admin/topics/:id/subscribers` follows the other admin subtable routes: 401 signed out, 403
without `admin:console`, 404 for a missing topic, else `{ subscribers }`. `loadAdminTopicSubscribers` in
`adminConsole.ts` reads each subscriber's user id, username, avatar, email, plan, signup, and last login with the
subscription's creation time and email preference, and counts the topic's emails to them, with the latest one's time,
from `topic_email_sends` in two subqueries. Newest first.

**The table.** `TopicSubscribersTable` in `apps/web/src/components/table/` loads its topic's subscribers when it opens
and keeps them for the next open, and shows the loading mug until they arrive. Its columns follow the users table's
order: Follower, Email, Plan, Signup, and Last login, then Followed, Emails, Emailed, and Last email. They sort and page
like the other admin tables. Emails reads "on" or "off". Email and Plan link as the users table's do. Emailed counts
every email the topic sent the subscriber, all time, and Last email is the latest one's date, or None. A failed read
says "Couldn't load the followers." in place.

**Only the console opens it.** `TopicsSubtableRow`, which only the console renders, passes `canListSubscribers` to
`OwnerTopicsTable`. With it, the subscriber count is a `SubtableCountButton`. Without it, the count stays plain, as on
the owner's profile.

**One subtable per topic row.** The table keeps each topic row's open subtable, "scans" or "subscribers", in one
record keyed by topic id. Opening one closes the other, as a team row's members and topics do in `AdminTeamsTable`.

**`UserLinks.tsx`.** The users table's links move into `apps/web/src/components/table/UserLinks.tsx`, each with a
tooltip naming its page: `UserNameLink`, the avatar and username to the profile, `UserEmailLink`, the email to the
activity page, and `UserPlanLink`, the plan to the account page. The users table and the subscribers table render
all three, and the team members table renders `UserNameLink`, whose avatar becomes part of the link.

**The email counts read one grouped join over a new index.** A subquery grouped by recipient counts the topic's sends to
each subscriber and takes the latest send's time, and the subscribers left join it, so a subscriber the topic never
emailed reads 0 and None. A new index on `topic_email_sends (topic_id, recipient_user_id, sent_at)` serves that read,
and the topics table's own monthly email count to the owner reads it too. Migration `0121` sets the lock timeout first
and creates the index if it does not exist. On 2.8M sends, per-subscriber subqueries took 89 seconds for 200
subscribers. The grouped join with the index took 139 ms for 2,000.

**The topics table's subscriber count shares the rule.** `loadOwnedTopics` in `apps/api/activityTopics.ts` counts each
topic's subscribers through `isActiveNonOwnerTopicSubscription` too, so the count on the button and the list it opens
read one condition.

## Risks / Trade-offs

- [A topic with thousands of subscribers] → The route returns every subscriber and the table pages them, about 350 bytes
  each. The largest topic has few subscribers today. Paging the route waits until one needs it.
- [An admin reopens the table often] → The query keeps a topic's subscribers for a minute, so a reopen within it sends
  no second read, and a failed refetch keeps the rows it already has.
