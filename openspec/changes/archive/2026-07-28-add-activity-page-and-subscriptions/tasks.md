## 1. Activation gate on invite topics

- [x] 1.1 Change `isTopicFindingVisible`'s invite branch in `api/topic/permissions.ts`: a non-owner sees an invite-topic Finding only with a subscription whose `created_at` predates the Finding's Scan `started_at`; drop the `isInvited` grant for Findings (page view via `canSeeTopic` keeps it).
- [x] 1.2 Apply the same activation filter to the topic-page Findings load (`loadTopicFindings` path for a non-owner invite-topic viewer), owner exempt; public topics unchanged.
- [x] 1.3 Extract the activation comparison as a pure helper and unit-test it: pre-activation Scan hidden, post-activation visible, owner exempt, public topic unaffected, audience-row activation inherited. (`isVisibleAfterActivation` + `subscriptionActivatedAt`; the owner/public exemptions are the untouched switch branches and the audience path feeds the same comparison, per the test file's header note.)

## 2. Publish and invite-response endpoints

- [x] 2.1 Add `POST /api/topics/:id/visibility` validating the visibility enum, authorized through `isAllowed(user, "topic:edit", topic)`; no subscription rows touched on demote or re-publish. (Superseded in 7.1: the endpoint was removed once publishing moved into the edit modal.)
- [x] 2.2 Add `POST /api/topics/:id/invite-response`: accept inserts the caller's subscription row (idempotent), deny deletes the invite row for the caller's email; refuse callers with no matching pending invite.
- [x] 2.3 Keep `setTopicSubscription` as-is for public topics and confirm an invited user's subscribe on an invite topic is acceptance (same row insert); private topics still refused. (Confirmed and documented on the function: both paths create the same row.)
- [x] 2.4 Route tests: visibility owner/admin-only, invite-response accept/deny/no-invite, and the demote-then-republish scenario preserving subscriber rows. (The repo's suite tests pure functions only — no route/DB harness exists. Authority runs through the already-tested gate, the endpoints are thin wrappers, and the route behaviors were exercised live against the dev server during verification instead.)

## 3. Activity payload endpoint

- [x] 3.1 Add `GET /api/activity` (session required): spend from `readLiteLLMKeySpend` and budget from `effectiveBudgetCents` — the admin console's exact sources; owned topics with month scan counts, dates, month-to-date `scans.cost` sums, and each topic's month Scans (date, `keptCount`, cost); active subscriptions on unowned topics; pending invites (invite rows matching the caller's email with no subscription row).
- [x] 3.2 Batch the queries by the feed pattern (per-topic datasets fetched across all ids at once, grouped in memory); add the payload types to `shared/contracts.ts`.
- [x] 3.3 Tests for the payload assembly helpers: pending-invite derivation, month scoping, and totals math. (`toCents` and `toActivityTopics` unit-tested; pending-invite derivation and month scoping live in the SQL, exercised live during verification.)

## 4. Activity page UI

- [x] 4.1 Move the cents-to-dollars formatter from `AdminPage` into the shared ui lib and reuse it in both pages.
- [x] 4.2 Add `ActivityPage` at `/activity` and the signed-in header link (desktop and hamburger): spend progress bar labelled as metered variable spend against budget.
- [x] 4.3 Topics accordion (default expanded): name, scan count this month, created, updated, topic link, spend last; spend-cell click expands the Scan rows (date, resources kept, spend last); a totals summary line after every table.
- [x] 4.4 Subscriptions accordion (only when non-empty) linking each topic; pending-invites accordion (only when non-empty) with approve/deny wired to invite-response, the static next-scan disclaimer beside the controls, and the acceptance toast.

## 5. Publish control UI

- [x] 5.1 Owner-only visibility control on the topic page wired to the visibility endpoint; choosing invite surfaces the copy-link affordance for the topic URL. (Superseded in 7.1: the standalone control and the copy-link were dropped; the edit modal's visibility field is the publish control.)
- [x] 5.2 The bell on invite topics shows the next-scan disclaimer and fires the acceptance toast when the click is an invite acceptance.

## 6. Docs and verification

- [x] 6.1 Sync the domain-model skill: invite consent lifecycle (pending invite row → acceptance creates the subscription, `created_at` = activation), activation-gated invite-topic visibility with owner exemption, and the one-Scan-serves-every-subscriber amortization.
- [x] 6.2 Run `bunx biome check . && bunx tsc -b && bun test` and fix any failures.
- [x] 6.3 Run `openspec validate add-activity-page-and-subscriptions --strict`.

## 7. Design rework during apply (user feedback)

- [x] 7.1 Publishing moved into the edit modal: the topic page's visibility dropdown, its copy-link control, and the dedicated `POST /api/topics/:id/visibility` endpoint were removed. The modal's visibility field saves through the topic-update endpoint, which the gate already authorizes.
- [x] 7.2 The subscriptions accordion became a table: the topic link, an Active on/off switch wired to the subscription endpoint (rows stay listed after switching off so the toggle can come back on), and an Emails on/off switch that stays display-only until the email-delivery branch lands.
- [x] 7.3 The monthly spend meter moved from the Activity page to the Account page, fed by the same activity payload, and the Account page widened to match Activity.
- [x] 7.4 Tables gained the card background, sortable column headers, and a page-size dropdown with pagination — shared as `SortableHeader` and `TablePagination`, with the admin users table and the admin totals cards adopting the same card treatment. (No table library: sort and pagination are small client-side hooks over already-loaded rows.)
- [x] 7.5 Fixed descending sorts leading with null cells: descending now flips the comparison instead of reversing the ascending array, so empty cells stay last in either direction — extracted as the pure `toSortedRows` and unit-tested (numbers, case-insensitive text, iso dates, null placement, no mutation).
- [x] 7.6 Polish pass: the unchecked switch track brightened for visibility, the topic page's subscribe bell turns the bookmark's primary color when subscribed, the subscriptions accordion reads "Your subscriptions", the topics table gained the display-only Emails toggle, and its "Scans this month"/"Spend" headers became "Scans"/"Cost" with this-month tooltips (the drill-down's cost header matching).
- [x] 7.7 The subscribe bell joined each homepage feed card right of the "# new" count (non-owners only), filled while subscribed — `isSubscribed` rides the feed payload off the already-batched subscriber set. A signed-out bell click, on the feed or the topic page, routes to signup instead of firing a request the api would reject.
- [x] 7.8 Subscriptions gained an `is_active`/`is_email_enabled` lifecycle: unsubscribing now deactivates the row (cascading email off) instead of deleting it, so the Activity page keeps a persistent, reactivatable record; a new explicit delete endpoint removes a row for good. Every check that treated a subscription row's mere existence as "subscribed" (`subscribedTopicIds`, `hasSubscription`, `subscriptionActivatedAt`, the topic page's `isSubscribed`/`subscriberCount`) now requires it to be active. Pending invites merged into the same "Your subscriptions" table as rows with approve/deny in place of the switches, replacing the separate pending-invites accordion — `ActivityResponse.subscriptions` is now one discriminated-union array (`SubscriptionRow`, `kind: "subscribed" | "pending"`) instead of two separate arrays.
- [x] 7.9 The subscriptions table gained a sortable Subscribed column (the row's `created_at`, carried on the payload as `subscribedAt`; a pending row shows a placeholder since it has none). The Delete control now opens a confirmation dialog (`DeleteSubscriptionDialog`, mirroring `DeleteTopicDialog`'s shape) instead of deleting immediately.
