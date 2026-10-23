## 1. Api

- [x] 1.1 Export `isActiveNonOwnerTopicSubscription` from `apps/api/topic/subscriberCounts.ts` and count through it.
      Verify with `bun run smoke:subscribers`.
- [x] 1.2 Add `AdminTopicSubscriberRow` to `packages/contracts/admin.ts`, `loadAdminTopicSubscribers` to
      `apps/api/adminConsole.ts`, and `GET /admin/topics/:id/subscribers` to `apps/api/admin.ts`, gated by
      `admin:console`.
- [x] 1.3 Add route tests: 401 signed out, 403 for a non-admin, 404 for a missing topic, and the subscribers for an
      admin.
- [x] 1.4 Add `fetchAdminTopicSubscribers` to `packages/client/billingClient.ts`.
- [x] 1.5 Index `topic_email_sends (topic_id, recipient_user_id, sent_at)`, generate its migration with the lock timeout
      first, and read the email counts in one grouped join. Count the topics table's subscribers in
      `apps/api/activityTopics.ts` through the shared rule too. Verify against the dev database that a subscriber's
      count and last email match a direct read.

## 2. Web

- [x] 2.1 Move the users table's name, email, and plan links into `apps/web/src/components/table/UserLinks.tsx`, and
      render them from `AdminUserRows.tsx`, `TeamMembersTable.tsx`, and the subscribers table.
- [x] 2.2 Add `TopicSubscribersTable.tsx`, which loads its topic's subscribers when it opens, with its story.
- [x] 2.3 Give `OwnerTopicsTable` `canListSubscribers`, passed by `TopicsSubtableRow`, and one open subtable per topic
      row.
- [x] 2.4 Add a render test: the count is a button with `canListSubscribers` and plain text without it.
- [x] 2.5 Move the scan costs table into `TopicScansTable.tsx`, so `OwnerTopicsTable.tsx` stays under 400 lines.
- [x] 2.6 Remove the divider between the admin page's Users and Teams sections.
- [x] 2.7 Give a subtable nested inside another subtable the card fill, through a `data-slot` on `TableCard` and one
      rule in the table class, and check it in light and dark mode.

## 3. Docs and verify

- [x] 3.1 Update `apps/api/AGENTS.md` and `apps/web/AGENTS.md` for the new route, loader, and components.
- [x] 3.2 `bun run check` passes, and the followers open in the console, checked on a side port against the dev
      database.
