# Tasks

Planning is complete when these artifacts validate. Implementation begins only after the user approves the design decisions and explicitly asks to apply this change. No task below is completed by writing this proposal.

## 1. Approve decisions and establish contracts

- [x] 1.1 Record the user's approval or revisions for the seven decisions in `design.md` section 1, including Personal Source Entry naming, shared-address manual email, key format, Plus/Premium email entitlement and shared send cap, editable destinations, sender-only private layers, and public-only podcast narration; verify the decision record resolves each one before editing implementation code.
- [x] 1.2 Update `.agents/skills/domain-model/SKILL.md` with Personal sources, Personal Source Entry, and both Source kinds, and add `ai` to code-style exceptions. Rename feature code, module paths, routes, scripts, and docs consistently; verify data-preserving migrations, ciphertext/retry compatibility, preservation of stored items, and no stale customer-facing naming.
- [x] 1.3 Add Source config unions, send/import payloads, Personal sources pagination/results, and plan values under packages/contracts. Use one placeholder ceiling of 200 in shared configuration and a separate Plus/Premium email entitlement. Verify payload boundaries, capability checks, current quota-result compatibility, unsafe URL/provenance rejection, and no changes to Premium API-key entitlement.
- [x] 1.4 Define additive Personal sources endpoints in the route contract registry and typed client without extending frozen legacy response enums; verify `bun scripts/check-contract-freeze.ts` passes against every unretired release and old Topic-save fixtures preserve hidden Personal sources.

## 2. Persistence, encryption, and privacy invariants

- [x] 2.1 Scope entries, receiving Sources, contexts, quotas, and retry metadata to their sender independently of the Topic owner. Add encrypted per-Finding/sender annotation storage and deletion-safe outbound reply snapshots. Verify composite keys, foreign keys, two senders using one client/Topic, and data-preserving legacy reads.
- [x] 2.2 Extract compatible private-text encryption into the server package while preserving chat wrappers; verify existing chat fixtures still decrypt and Personal sources fixtures reject missing keys, tampering, and plaintext persistence.
- [x] 2.3 Use central Topic edit authority for sends/imports/email, including public, invite, private, owning-Team, and admin-edit destinations. Scope all private reads and deletes to sender identity. Test owner/Team/admin isolation, followers and holding-Team readers, permission loss, and cleanup after downgrade.
- [x] 2.4 Remove activation-based publication, invitation, Team, ownership-transfer, and podcast restrictions while preserving normal gates. Test sends racing visibility changes and transfers without exposing items, summaries, annotations, counts, or provenance.
- [x] 2.5 Keep encrypted entries until explicit deletion. Remove their queued links, invalidate sender context and annotations, and prevent receipt replay after deletion. Verify the persistence, retention, links and sharing smoke sections.
- [x] 2.6 Generate additive migrations, preserve existing encrypted entries and isolate legacy generated text. The owner chose to retain development-only historical copies for review. Keep the original review data intact.

## 3. AI Agent identity, account controls, and API credentials

- [x] 3.1 Preserve verified `azp` client identity in MCP caller resolution and derive connection state from clients/consents/live refresh grants; verify revoked, expired, disabled, wrong-resource, wrong-user, rotated-only, and name-spoof fixtures are refused.
- [x] 3.2 Group registrations by validated app domain with explicit known aliases and isolated loopback identities; verify unknown names cannot impersonate Claude or ChatGPT and several legitimate registrations form one account group.
- [x] 3.3 Add session-authorized connection list/revoke endpoints with per-user serialization and disconnected-history handling; verify revocation immediately stops new sends, preserves another user's grants, and leaves existing JWT read expiry semantics unchanged.
- [x] 3.4 Add Premium key create/list/revoke endpoints with random `cnk_v1_` keys and digest-only storage; verify one-time display, ten-active-key bound, constant-time comparison, redacted logs, immediate revocation, downgrade refusal, and cleanup after downgrade.
- [x] 3.5 Implement portable account connection/key sections with Nightshift adapters and stories; verify connected/disconnected/loading/error/one-time-secret states, accessible controls, and no checkout route from native UI.
- [x] 3.6 Document key setup, app-domain identity, disconnection limits, and revocation in the existing MCP guide and privacy policy; verify every documented control is implemented and no text claims assistant-account access.

## 4. Shared send service and MCP

- [x] 4.1 Implement identity → shared allowance → authority checks with atomic accepted-delivery counters. Sum existing send/email daily rows and serialize all origins under the same account lock. Verify the same 200 ceiling on every plan, mixed email/agent last-slot concurrency, UTC rollover, no reset on plan changes, cross-agent/key pooling, rollback, duplicate bypass, and no refund on deletion. Preserve pre-rollout usage and accepted items.
- [x] 4.2 Include every editable Topic in suggest_topics and remove public discovery from the send picker and text fallback. Retain the relevance floor for email routing; show every editable Topic in MCP, best matches first and checked, with name filtering. Retain shared cursors, no storage/allowance use, new private Topic offer on every page and search, and explicit confirmed drafting. Test Team/public destinations, read-only exclusion, deterministic pages, and both routes.
- [x] 4.3 Create or reuse receiving Sources by Topic, sender, and concrete identity without consuming fetched capacity. Verify concurrent first sends for two senders never merge their Sources or private metadata, and both succeed at ten fetched Sources.
- [x] 4.4 Expose `POST /api/personal-sources/sends` using the same service and send-only API credentials; verify status codes, no broad account access, retries/conflicts, and replay after deletion cannot recreate content.
- [x] 4.5 Require explicit Topic IDs for every send on both routes and HTTP. Update both tool descriptions for send/share/save/add/forward requests to Carl/CarlNotes/the user’s topics: suggest and wait only when unnamed, named Topics go straight to send after ID resolution, and ambiguous names need clarification. Test all fifteen verb/recipient combinations, no autonomous calls, synthesis/no-raw-conversation guidance, bound/missing-ID behavior, and thirteen-tool annotations.
- [x] 4.6 Render receipts and existing Topic Draft previews with user confirmation before creation; verify existing suggestion and creation gates, altered/expired confirmations, text-only results, and MCP view interaction.
- [x] 4.7 Add the one-time connection nudge, connected-AI Agent picker, and accepted-history-only recommendation rule; verify dismiss/reconnect behavior and that suggestions never create content or inspect assistant history.
- [x] 4.8 Update API/MCP/core AGENTS maps and the guide's tool table; verify `bun test apps/api/mcp apps/api/personalSources packages/core` and the MCP view host tests pass without weakening prior origin/auth/size tests.

- [x] 4.9 Add one-to-twenty explicit destinations to the shared send contract. Preserve single-ID clients, atomic authorization/storage, one daily charge, sorted retry identity, and bound-route restrictions. Verify boundary/unit tests and `bun run smoke:personal-sources multi-send`, including last-slot concurrency, full rollback, reordered replay, and deletion.
- [x] 4.10 Complete the suggest-topics MCP Apps view with existing host calls, the shared numbered paginator, outlined Send followed by the highlighted standard new-Topic Button, and the standard search-result row with a checkbox in place of rank/kind and Best match at the right. Share row composition and Topic metadata across web/mobile and the picker, preserve authorized podcast playback through MCP-view-only data, and verify current-page metadata stays bounded. Follow opaque cursors for direct page jumps and retain the current page on failure. Preserve best-match defaults, query/cursor selection retention, one-call Send, retry safety, confirmed drafts, and numbered fallback. Use five-row pages, a linked site mug/brand, debounced name autocomplete without a model call, results-only fixed-height loading, live TagPill selections under Topics to share this chat with, and standard padding for both footer Buttons. Verify checkbox checks/unchecks and pill removal update each other immediately. Add independently openable Default, Searched, PageTwo, Sent, Autocomplete, SelectionSynced, and Loading stories using the existing mock; verify submitted search, retained/off-page choices, second-page navigation, every receipt, and disabled duplicate submission. Retain empty/error/bound/long-title stories and responsive keyboard checks.
- [x] 4.11 Update both-route MCP smoke sections, documentation, and maps for four MCP views and seven MCP view tools. Run `bun run smoke:mcp`, `bun run build:docs`, and `bun run check`; report component parity without starting phone emulators or deleting review data.

## 5. Selected chat imports

- [x] 5.1 Add browser-worker parsers for sanitized ChatGPT and Claude JSON/ZIP export fixtures plus pasted text; verify explicit conversation preview/selection and unsupported-version refusal without importing unknown records.
- [x] 5.2 Enforce the shared 10 MiB input, expanded-content, and upload-batch limits with safe archive parsing; verify boundary, ZIP bomb, path traversal, encrypted archive, attachment, cancellation, and buffer-release fixtures.
- [x] 5.3 Implement all-plan authenticated import persistence with import provenance, no expiry, safe links, and batch/conversation idempotency; verify no OAuth requirement, no send-quota consumption, duplicate retries, and deleted-entry replay handling.
- [x] 5.4 Support explicit web import selection and native guidance. Verify unselected conversations stay local. Render the shared component on the requested iPhone target. A second mobile platform was waived.
- [x] 5.5 Document supported export formats, selection, size, model coverage, retention, and deletion; verify `bun test apps/api/personalSources packages/core apps/web/src` and `bun run build:docs` cover the resulting behavior and page.

## 6. Email receiving

- [x] 6.1 Read the shared receiving mailbox from RESEND_FROM_EMAIL, accepting a bare address or display-name form. Forwarding, digest replies, and Carl’s replies share the same mailbox per environment. Return it through the read-only payload to the shared empty-state mailbox hint and Copy, without server env imports in universal packages. Update maps, operator docs, and domain vocabulary. Test alternate dev/production addresses, invalid/missing configuration, first mail at ten fetched Sources, and preservation of review data.
- [x] 6.2 Verify raw webhook bytes, enforce the environment mailbox and check provider-computed aligned DKIM and DMARC before any reply or filing. Cover changed senders, forged headers, automatic mail and replay. An unknown account gets sign-in guidance only after authentication.
- [x] 6.3 Route email through the shared content matcher over all editable Topics, with optional fuzzy subject/first-line `topic:` name boosts. File all clear matches once. Test case and typos, relevant/weak matches, unavailable matching, and zero content storage/charge when nothing matches.
- [x] 6.4 Preserve bounded email extraction, safe links, no remote/raw/attachment fetch, and sender provenance. Permit Plus and Premium email within the same daily send allowance used by AI Agents. Commit all destination entries and one charge with the reply outcome. Verify mixed-channel usage in both orders, plain daily-limit refusal copy and UTC reset values, duplicate/restart/delete/replay/account-change behavior, and provider retry bounds.
- [x] 6.5 Send same-thread replies only to verified human senders. Cover registration guidance, the plans link, UTC limit, clarification and numbered linked confirmation. Other mailbox addresses are ignored. Refusals create no Topic item or charge.
- [x] 6.6 Document manual forwarding to the environment’s shared mailbox with optional content hints and linked filing replies. Preserve Resend receiving/MX/webhook and the exact development tunnel/DNS setup. Verify the guide follows the implemented flow and preserve outbound/support mail records.
- [x] 6.7 Add focused receipt tests and provider fixtures under the importing workspaces; verify `bun test apps/api/personalSources packages/pipeline/personalSources packages/server` and package-boundary checks pass with every new dependency explicitly declared.

## 7. Durable summarization and private scoring

- [x] 7.1 Track revisions, debounce, retention, recovery, and independent pending context per sender and Topic. Keep Temporal histories content-free and prevent one blocked sender from starving another. Test bursts, retries, missed signals, multiple senders, and zero-call clearing.
- [x] 7.2 Add the versioned `summarize-personal-sources-context.md` prompt and bounded builder; verify 80,000-character input, 8,000-character output, deterministic incomplete-coverage reporting, fresh nonce fences, forged delimiters, and no missing placeholders.
- [x] 7.3 Bill each per-Topic/per-sender summarization attempt to the current Topic owner through Scan-style key selection, spend reservations, and accounting. Keep sender and billing identity separate. Verify two senders/one owner, one sender/two owners, missing/exhausted owner keys, missing sender key, retries, failed attempts, transfer before/during generation, exactly-once attempt accounting, and no charge when Scans reuse a summary. Owner payment grants no access to sender text.
- [x] 7.4 Commit model output only for the current live revision and invalidate on deletion; verify adversarial interleavings cannot resurrect text or expose stale context to a Scan.
- [x] 7.5 Separate public Topic context from bounded sender contexts in review. Include eligible send text and links in scoring on every visibility while keeping private material out of search, global embeddings/Resources, reports, chat retrieval, and telemetry. Recheck all included sender versions and permissions.
- [x] 7.6 Replace podcast suppression with public-only narration. Write a shaped Finding’s public page-grounded explanation and sender-private annotations in one structured model call per sender, validate evidence and recipient/privacy boundaries, and commit both layers atomically. Test multi-sender isolation, missing/malformed output, deletion races, budget deferral, and podcasts after publication.
- [x] 7.7 Add deterministic prompt/output tests and adversarial multi-sender model evals for public canary absence, annotation recipient isolation, untrusted instructions, page grounding, deletion, and single-call generation. Keep existing summarization evals and update scripts, README, and maps.

## 8. Link queues and Source integration

- [x] 8.1 Implement `aiAgentIngester` and `emailIngester` against the shared ingester interface with common private queue selection; verify empty/ready/retained/deleted cases and ordinary canonical Resource output with null private snippets.
- [x] 8.2 Persist claim and evaluation/Finding outcome evidence for accurate queued, scored, and became-a-Finding states. Verify unscored rejection copy, failed/stopped/deferred retries, duplicate links across Sources, same-Topic Finding links, deleted/hidden Finding fallback, and no cross-sender reads.
- [x] 8.3 Persist the strongest personal-source contribution score bonus on each Finding. Add the placeholder 0.10 bonus beside the custom bonus, halve it for newsletter/automatic provenance, and never stack both. Prioritize queued links before the scoring cap and skip their embedding relevance pre-filter. Test insert/re-score persistence, stronger contributions to existing Findings, Topic isolation, missing/weak embeddings, queue retention, full explanations, safety, and max-results trimming. Generate/apply the additive development migration, run bonus/link smoke and full preflight, and document the rule in the domain-model skill.
- [x] 8.4 Integrate first-receipt readiness with generic Source editing and legacy API projections; verify existing fetched Sources still screen/fetch as before and stale web/mobile/Topic Tool saves cannot remove new Personal sources.
- [x] 8.5 Update pipeline/contracts/client AGENTS maps and Source documentation; verify `bun test packages/pipeline/ingest packages/pipeline/personalSources packages/pipeline/review apps/worker` and the existing Scan smoke fixture remain valid.

## 9. Topic UI and documentation completion

- [x] 9.1 Scope summary/count/title-page/item-page responses and cache keys to the authenticated sender, independent of Topic ownership. Verify authorization before decryption, UTC-week/total counts, stable paging, stale-context suppression, and request/cache cleanup across two users and account switches.
- [x] 9.2 Show each editor or authorized returning sender the same flat Personal sources section inside Topic info and Artisanal Blend, without a separate button, popover, grouped disclosure, or horizontal inset, preserving shared composition and privacy. Use one collapsed Personal sources · N items header in the muted Architects Daughter section-label style with the privacy label on its right; it opens the item list without displaying or fetching the internal scoring summary or its coverage helper text, with independent nested item expanders. Hide the entire section and its dividers when count-only metadata has no sender items; load item-text queries only while open and verify collapse aborts reads and releases decrypted pages. Keep the current sender’s live item count beside the header label, using singular/plural copy and refreshing after deletion, use compact Steeping loading, remove outer section-row padding, put Delete at the expanded item’s top right, put Next brew beside queued links, replace the item-count heading with sequential row numbers in regular Architects Daughter without trailing dots across numbered pages, show sender details only inside expanded content, limit pages to five items using existing numbered squares, preserve the ciphertext-size bound and direct jumps without retaining other private pages, clamp retired pages after deletion, use equal eight-pixel top/bottom item-content padding, no added header-to-list padding or first-item top padding, and equal eight-pixel space around pagination controls, and remove the final item divider while retaining compact bottom padding. Use label underline feedback instead of a row fill, reduce vertical spacing, and preserve minimum touch targets and keyboard focus. Keep forwarding setup out of Topic editors. Verify the one-line empty-state mailbox hint and Copy, counts, sender-only full content/outcomes/delete/paging, and ten fetched Sources.
- [x] 9.3 Build both mobile surfaces with the same core composition as web and verify one native platform, iPhone, and thin native presentation/clipboard adapters. Verify the live item-count header, flat item expansion, paging, link destinations/statuses, deletion, empty/setup/gated states, touch targets, enlarged Dynamic Type, accessibility labels, both themes, and web-only import copy.
- [x] 9.4 Add `packages/core/components/ExpandableRow.tsx` and use it for item disclosures in both existing surfaces in all three platforms. Give it a Nightshift contract at `packages/nightshift/components/expandable-row.ts` and matching primitive implementations and stories. Build each new feature component once in core with same-name app wrappers, including the import button and dialog. Share state and formatting; keep nested links/delete outside its trigger. Add paired stories for every new web/mobile component, including the shared section and both placements empty/with-items/item-expanded, and shared-row collapsed/expanded states. Add source/item/empty/loading/error/long-content stories and disclosure tests, record actual reuse/adaptations and the component parity counts, and pass component/client parity and frozen-client gates.
- [x] 9.5 Update MCP docs, tool descriptions, and privacy policy for the full explicit trigger vocabulary, named-Topic bypass, one item per destination/one delivery charge, and Topic-owner summarization billing. Preserve sender-private items/summary/annotations, any retained sender’s section with Topic read access, page-grounded public explanations, public-only podcasts, all tool limits, confirmed drafts, existing privacy coverage, and what Carl never reads.

- [x] 9.6 Build and preview the email guide with manual send and forward instructions, optional hints, same-thread number/name replies, matching, account and plan guidance, the shared cap, encrypted retention and deletion. Verify the public docs build.

- [x] 9.7 Keep the sender-authorized private Finding annotation endpoint, with no-store responses and no public payload changes. Finding popovers and sheets render the public note alone; remove the annotation UI, its paired stories, and its unused client read. Verify anonymous/other-sender/owner/admin reads, SSR/public cache absence, annotations invalidated by source deletion, and parity counts.

## 10. Integrated acceptance and release evidence

- [x] 10.1 Add a root `smoke:personal-sources` script and fixtures covering a real dev receive → summarize → scan → delete flow, plus outage recovery and fixture lifecycle; verify the script, README entry, and module maps agree and explicitly requested manual-review fixtures remain available to the user afterward; remove only temporary failure fixtures.
- [x] 10.2 Run `bun run check` and `bun run smoke:mcp`; verify every existing gate remains green and the smoke report includes all thirteen tools on both routes with origin/auth/result-size checks intact.
- [x] 10.3 Run the live development Personal sources smoke and the bounded `eval:personal-sources-context` fixture set under Doppler; verify Topic-owner summarization billing, bounded context, surviving Findings, missing-key behavior, and canary absence from prohibited destinations.
- [x] 10.4 Regression-test web at desktop and phone width, then one native platform against the supplied mockups. The user selected iPhone and waived the second platform. Verify both shared-row surfaces, the live item-count header, all link outcomes and Finding destinations, deletion, clipboard/setup, existing feeds/chat/source editing, and no runtime errors. Stop task-owned processes and release browser/simulator memory between platforms; name unverified checks.
- [x] 10.5 Preserve the controlled Gmail evidence and review entries. Verify current same-thread clarification, account and plan outcomes through rendered templates, disposable database records and integration tests. The user waived additional mailbox sessions.
- [x] 10.6 Review the implemented feature against current connector policy and actual provider retention configuration; verify docs make no unsupported approval, history-access, or storage claim and attach the operator's rollout checklist. Evidence: the controlled Resend account shows Pro; published retention is 30 days and inspected received-message menus expose no deletion control. Custom retention and provider deletion procedure remain production operator checks. The current Anthropic policy creates a directory eligibility decision for summary sends and derived context, recorded in `apps/docs/personal-sources-rollout.md`; no approval is claimed.
- [x] 10.7 Verify every revised scenario, including two senders on a public/Team Topic, publication and transfer races, sender-only endpoints/caches, retention of the owner's historical development copies, public-only reports/chats/podcasts, and one-call dual explanations. Run strict OpenSpec validation with path containment and refresh acceptance evidence and remaining operational steps.

## Validation commands

Run commands from the repository root. Before any OpenSpec command that reads main specs, resolve candidate paths and existing parents against the real `openspec/specs` root. Reject escaping symlinks and traversal.

Planning gate, available now:

```sh
openspec validate personal-sources --strict
openspec status --change personal-sources
git diff --check
```

Implementation gates, available after their tasks land:

```sh
bun run db:generate
bun test packages/contracts packages/db packages/server
bun test apps/api/personalSources apps/api/mcp apps/api/authorization.test.ts
bun test packages/pipeline/personalSources packages/pipeline/ingest packages/pipeline/review apps/worker
bun test packages/core apps/web/src
bun run check
bun run build:docs
bun run docs:embed
bun run smoke:mcp
bun run smoke:personal-sources
bun run eval:personal-sources-context
bun run eval:personal-sources-scoring
```

`smoke:personal-sources` and `eval:personal-sources-context` are required by tasks 10.1 and 7.7; verify their availability after the naming migration. Their root scripts must use development Doppler configuration and bounded fixtures. They make real service/model calls; ordinary `bun test` must not.

The owner selected one iPhone simulator for native review. The November 4 verification below records the device and coverage. Web regression also covers desktop, phone width, both themes and enlarged text.

## Remaining acceptance limits

The owner chose to keep older development explanations with no source-item link. Newly generated private text records its source items. The controlled Gmail run covered explicit and semantic routing, duplicate deliveries and replies to Carl. Provider fixtures cover invalid DKIM and DMARC. Outlook has no live test account. The native evidence below identifies the device checks.

## Workflow follow-up

- After implementation and review, use `/ship` and archive with `openspec archive personal-sources --yes` when authorized. Do not archive, commit, push, provision services, or change a listing as part of this proposal.
- Follow the documented rollout and rollback sequence. Keep privacy restrictions, read/delete/revoke, and explicit-deletion cleanup active even if receiving is disabled.

## 11. Final routing and email design

- [x] 11.1 Replace Finding-vector routing with transient matching over current Topic names, prompts, and ready attachment context. Preserve stable input, the email relevance floor, all editable Topics in the MCP picker with strong matches checked first and literal name autocomplete/filtering, no public discovery in the picker, exact cursor totals, and no routing writes. Test all candidate batches, later email chunks, metadata changes, permission rechecks, and unavailable models.
- [x] 11.2 Replace exact-name/single-Topic email resolution with fuzzy name boosts and all clear editable matches. Ignore empty hints, handle case/typos/multiple names, exclude weak and read-only matches, and distinguish no-match from temporary unavailability. Keep both-route MCP view behavior and numbered fallback.
- [x] 11.3 Reuse atomic batch persistence for email with one email charge across every destination. Bind the durable reply to the committed list and preserve sender identity, retry/deletion safety, refusal rollback, last-slot concurrency, and one shared daily send cap across AI Agents and email. No migration may discard retained review data.
- [x] 11.4 Render the exact filing introduction and numbered linked Topic list with the one-line removal instruction in HTML and plain text. No-match replies ask for a new forward with a `topic:` line. Keep current docs, UI, and planning artifacts consistent with content matching and optional fuzzy hints.
- [x] 11.5 Run focused matcher, email, quota, rendering, privacy, and podcast tests; live persistence and both-route MCP smoke; controlled Gmail multi-Topic/no-match delivery; docs build/embed; and `bun run check`. Keep review data and report parity counts. Phone emulators remain deferred.

## 12. Digest mailbox and link-bearing replies

- [x] 12.1 Use the RESEND_FROM_EMAIL mailbox for receiving, all address/Copy controls, every Carl email’s default Reply-To, and Personal sources replies as Carl. Preserve existing From display names on other email kinds. Cover bare and display-name settings, exact recipient matching, and single/batch senders.
- [x] 12.2 Process replies to any Carl email with a new safe public link like forwards. Strip quoted text/HTML history; ignore linkless replies before matching, filing, allowance, or another reply. Preserve explicit forwards and automatic-response/authentication gates. Remove unused confirmation fingerprints, metadata lookup, tests, column, and index from unpublished migrations. Test digest, filing, clarification, thanks with quoted links, new HTML links, and text-only forwards.
- [x] 12.3 Reconcile only the backed-up development schema and unpublished migration history while preserving review items. Update docs/artifacts, run focused tests, persistence smoke, docs build/embed, and preflight. Live-test forwarding and link-bearing/linkless replies at the configured digest mailbox after receiving is enabled on that domain; stop temporary workers.

## 13. Final-additions acceptance

The final November 3 additions authorize these planning revisions. Reopened tasks name implementation gaps; previously passing gates do not verify the new contract. Routing embeddings keep their sender key; Topic-owner billing applies to summarization. Existing item privacy, Topic read gates, atomic multi-destination accounting, and the emulator deferral remain in force.

- [x] 13.1 Verify the complete revised flow with focused matcher/tool-description, email/provider/rendering, shared mixed-channel quota, Plus/Premium entitlement, owner-billing, and private-context tests. Run real email and multi-send persistence smoke, both-route MCP smoke, four picker story checks, docs build/embed, and full preflight. Report component parity counts and explicitly deferred native checks. Preserve all review items and stop temporary workers between checks.
- [x] 13.2 Verify authenticated unregistered guidance, Plus/Premium acceptance, the Free upgrade link, cap/reset, multichannel filing and same-thread choices. Use provider fixtures and disposable database records. Retain the owner’s data.

Focused commands before the existing integration gates:

```sh
bun test apps/api/mcp/personalSourcesTools.test.ts apps/api/mcp/topicSuggestions.test.ts
bun test packages/pipeline/personalSources packages/server/personalSourcesEmailReplyContent.test.ts packages/emails packages/server/resendInbound.test.ts
bun test apps/web/src/mcpViews packages/core
bun run smoke:personal-sources email
bun run smoke:personal-sources multi-send
bun run build:storybook
bun scripts/check-component-parity.ts
```

## Latest entitlement and allowance revision

Email forwarding is a Plus and Premium capability. AI Agent sends and accepted forwarded emails share one daily send pool: 200 on every plan. Free has the same ceiling for AI Agent sends and no email forwarding. An accepted multi-Topic email consumes one shared slot; imports, suggestions, refusals, retries, and replies consume none. Preserve Topic-owner summarization billing as a separate model-cost rule.

Tasks 1.3, 4.1, 6.4, 9.2, and 11.3 are reopened for this revision. Update the plan comparison, MCP/email guides, UI badges, refusal/upgrade/cap replies, domain vocabulary, both-route smoke, and persistence fixtures together. Existing per-origin daily rows must contribute to a combined total without a data reset or schema rewrite; drain old receiving processes before rollout. Test 199 mixed accepted sends/emails followed by the final slot on each eligible plan, a mixed email/send last-slot race, both orders, plan changes, zero-charge replay, and multi-Topic acceptance. Re-run the existing focused and integration commands before marking these tasks complete.

## 14. Common ceiling and shared PlanCards

- [x] 14.1 Enforce one shared placeholder ceiling of 200 per UTC day for every account. Keep Plus/Premium email and Premium AI Agent API keys as separate capabilities. Sum both origins atomically, preserve existing usage, and return “The day's limit is reached.” for AI sends or “The day's email limit is reached.” for email, without upgrade guidance. Update quota/entitlement fixtures, mixed-channel real database smoke, email/MCP refusal rendering, docs, and all superseded planning copy.
- [x] 14.2 Add the exact AI-chat line to every shared PlanCard and the exact email line only to Plus/Premium using the existing checkmarked row adapters. Show no ceiling on cards. Add paired states and meaningful rendering assertions, check desktop/phone-width wrapping, run preflight, and record component parity. Preserve prices, unrelated quotas/actions, review data, and the emulator deferral.


### Plans and shared ceiling verification — November 3, 2026

Tasks 1.3, 11.3, 14.1, and 14.2 are complete. One shared contract constant sets the provisional 200-per-UTC-day ceiling for every account. The locked receipt sums existing AI/email origin rows and increments only the accepted delivery's origin once, preserving usage without a migration. Plus/Premium email entitlement is separate; AI Agent API keys remain Premium-only. MCP views say “The day's limit is reached.” Email replies say “The day's email limit is reached.”

The same core PlanCard renders both exact checkmarked feature lines through existing web/native row adapters, with email only on Plus/Premium and no ceiling on cards. Both platforms have Free, Plus, Premium, and PlusYearly stories. Four web states passed at desktop and phone widths; Plus also passed the 200% text overflow check. Native emulator rendering remains explicitly deferred.

Validation: `bun run check` passed (3,433 tests, 0 failures); `bun run smoke:personal-sources quota`, `email`, and `multi-send` passed against disposable development accounts; `bun run build:docs` built 22 pages; `bun run docs:embed` synced 143 sections (5 updated); strict OpenSpec validation passed. Component parity is 151 pairs: 54 shared, 97 documented exceptions (12 platform API, 22 platform difference, 63 not yet shared), 3 contracts, and 1 documented pre-existing uncontracted primitive. The retained manual-review data was not changed. Other unchecked tasks and the legacy-derived-text retention decision remain open; this update does not archive or ship the larger change.


## 15. Final email design cleanup

- [x] 15.1 Keep one environment-configured manual-forwarding mailbox, content matching with optional `topic:` hints, numbered linked filing replies, and the common 200-send ceiling. Remove superseded implementation and compatibility paths with their tests, schema objects, and copy. Regenerate unpublished feature migrations, reconcile development without changing retained items, validate fresh-install DDL and repeat migration detection, and search implementation, active OpenSpec artifacts, every AGENTS.md, and docs. Keep the MCP suggest_topics MCP view and delivery retries and automatic-response safeguards. Record exact removals, remaining matches, preflight, live persistence checks, and the environment-address regression results.

### Cleanup verification — November 3, 2026

Tasks 6.1 and 15.1 are complete. The configured receiving mailbox now supplies recipient validation, the empty-state hint and Copy, reply text, and Reply-To. The final branch schema uses two generated migrations and no address-specific receipt columns. Development recognizes the replacement chain without additional schema changes; all 45 review items remain unchanged. The disposable fresh prerequisite-schema DDL check passed.

Preflight is green: 3,438 tests, zero failures, 15,691 assertions across 588 files. Email/multi-send/schema persistence smoke passed 43 assertions; deletion/rollback passed eight more. Docs built 22 pages and refreshed six of 143 indexed sections. Strict OpenSpec validation and the final diff check passed. The 3,385-file audit covered all 17 AGENTS.md files and found only the shared mailbox Copy label/test and the retained MCP view label among the requested phrases. Component parity remains 151 pairs, 54 shared core components, 97 documented exceptions, three implemented contracts, and one documented primitive exception. Native checks remain deferred.

Evidence: `/Users/doubleoevan/Documents/Codex/2026-11-02/ple/outputs/personal-sources/email-design-cleanup.md`. The broader feature and release checks remain open as marked above.

### Personal source bonus verification — November 3, 2026

Task 8.3 is complete. Findings persist a constrained full/half personal-source score bonus across re-scores, personal/custom bonuses do not stack, and a stronger incoming contribution reopens an unchanged-content review while preserving thumbs-down exclusion. Queued links lead scoring and skip embedding work/floors; missing vectors pass through deduplication, and safety, explanations, budgets, and max-results trimming remain active. Forwarded newsletters retain half-score bonus classification through list headers or unsubscribe/preference links.

`bun run check` passed 3,444 tests and 15,709 assertions across 588 files. `bun run smoke:personal-sources bonus links` passed 36 live database assertions. The bonus schema was applied in development and is now included in the regenerated unpublished `0132_personal_sources.sql`; the 45 retained review items remain intact. Strict OpenSpec validation and `git diff --check` pass. No UI or native changes, production migration, archive, commit, or push occurred.

Evidence: `/Users/doubleoevan/Documents/Codex/2026-11-02/ple/outputs/personal-sources/personal-source-bonus.md`.

## Digest-mailbox reply validation

Tasks 12.1 and 12.2 pass full preflight: 3,450 tests, zero failures, and 15,739 assertions across 588 files. Email/bonus persistence smoke passes 41 assertions. Docs build/embed, strict OpenSpec validation, and diff whitespace checks pass. The generated schema removes only obsolete reply-fingerprint metadata; all 45 retained review items remain unchanged. Parity remains three contracts with both implementations, 151 paired components, 54 shared core components, and 97 documented exceptions. No new UI component or emulator run was needed.

Task 12.3 is complete. Development uses `Carl <carl-dev@updates.carlnotes.com>` with receiving enabled on `updates.carlnotes.com`; the existing webhook and running tunnel are unchanged. The full development stack was restarted with both receiving flags enabled in `carlnotes/dev`. Live Gmail forwards pass aligned DKIM/DMARC, file once per clearly matching Topic, consume one shared allowance, and receive numbered linked replies from the same mailbox.

Live replies exposed a flattened-MIME quote bug: an unmarked plain-text alternative restored quoted HTML content. Rich replies now derive text from the stripped HTML, preserving paragraph boundaries for Topic hints. The failing regression fixtures now pass. Repeated replies to both a digest and filing confirmation with new links produced four correct items across two Topics for two charges; repeated linkless replies with quoted public links produced no item, charge, matching, or reply. A signed replay of the original delivery added nothing. All nine controlled deliveries passed receiver DKIM/DMARC. The 44 entries present at the live-test baseline remain byte-for-byte unchanged; 54 entries are retained including the deliberately preserved initial regression fixtures and corrected repeat fixtures.

Post-fix preflight passed 3,451 tests, zero failures, and 15,744 assertions across 588 files. Existing persistence smoke (41 assertions), docs build/embed, strict OpenSpec validation, and parity gates remain verified. Temporary test processes exited; the requested development stack and tunnel remain running for manual review. Phone emulators remain deferred. Production is planned to use `Carl <carl@updates.carlnotes.com>` but was not changed. No archive, commit, or push occurred.

### Source-link and native parity follow-up

- [x] Share source-link resolution, local Finding selection, and actions in `packages/core/components/PersonalSourceLink.tsx`; retain thin same-name platform adapters and the existing Finding popup/sheet. Source links use stored page titles or full-URL fallback, truncating long labels without shortening accessible names. Source links with an authorized Finding open the existing Finding detail popup on web or sheet on mobile in place, preserving the parent section, page, expansion, scroll, and route. The tooltip and native accessibility hint say **A topic finding note from Carl**. Other source links open externally with the Lucide ExternalLink icon; only pending links also show **Next brew**. Reviewed or rejected links show no status label, and there is no separate **Became a finding** link. An unavailable Finding falls back to its external source page.
- [x] Verify the native layout on one iOS simulator, as requested, against web; capture the list and Finding sheet, check return to the same item/page, and report component parity counts. Android runtime verification is outside this review pass.

- [x] Remove the private annotation block, its paired components and stories, and its unused client read from Finding views. Retain encrypted derived annotations and sender authorization. Reduce native source-link row height while preserving platform touch targets.

November 4 native review used the iPhone 18 Pro simulator: Topic info and Artisanal Blend share the same section, five-item pagination retains continuous numbering, page two and item six remain selected after closing the Finding sheet, and reviewed external links open in the native browser. Stored page titles and the full-URL fallback truncate visually with full accessible labels. Finding views show only the public note. Captures are in the Personal sources review output. Native sign-in after rebuilding and enlarged-text layouts remain unverified; Android was outside this pass.

- [x] Remove forwarding setup from Topic editors and their stories. Restrict the configured mailbox to one hint line with Copy in empty Personal sources content, retain docs, and search for obsolete setup UI/copy.

- [x] Correct AI conversation destination marks, distinguish regular Claude from Claude Code, link the full date, destination platform mark, and name, followed by the launch icon. Share artwork and URL matching, with paired platform-gallery and expanded-item stories plus host/path boundary tests.

### Saved receipt and sender identity QA

- [x] Replace repeated raw receipt paragraphs with a bold saved title, linked Topics, and flush numbered next-brew links. Keep links in bounded MCP-view-only metadata and preserve accepted outcomes on a display-read failure.
- [x] Resolve MCP view links independently of a document base, version preferred resources with backward-readable aliases, and report host link refusals without bypassing host policy.
- [x] Share date-only sender metadata across web/mobile with AI platform marks or mail icon and address. Preserve explicit Delete.
- [x] Verify receipt links, authorization, review/deletion behavior, bridge outcomes, Nightshift stories, component parity, and `bun run check`; rebuild and restart local QA without deleting review data.

### Retained encrypted items and conversation backlinks

- [x] Remove automatic Personal sources item, summary, and annotation expiry. Keep all encrypted content until explicit entry/Source/Topic/account deletion. Remove obsolete deadline storage and timers, preserve existing content, and retain nullable wire fields for released-client compatibility.
- [x] Preserve optional conversation references through suggest_topics and every picker send, retry, page, and new-Topic flow. Keep references out of model matching, candidate queues, result summaries, and logs. Never fabricate or publish a conversation URL.
- [x] Make the complete date, AI platform label, and mark a body-size, underlined Nightshift link with launch icon when a validated conversation reference is present, sharing core behavior and platform adapters. Keep non-linked labels for unavailable references and email sender identity.
- [x] Update the active proposal, design, specs, docs, privacy policy, skills and AGENTS copy. Cover permanent retention, deletion and encryption, backlink propagation, URL validation, sender isolation, and platform rendering in tests/stories. Run schema generation and development migration, persistence/MCP smoke, builds, strict validation, parity, and full preflight. Retain manual QA data.


### Email clarification and editable Topic creation

- [x] File clear email matches immediately. When routing is unclear, store the provider and sender references and encrypted ordered Topic IDs. Retrieve original content from Resend only for the matching sender.
- [x] Resolve reply numbers and written existing Topic names, including clear typos. Recheck current access before filing. Keep the original numbering and omit revoked Topic details.
- [x] File one item per destination and charge once. Retire choice state after successful filing. Cover account deletion, duplicate webhooks, concurrent sends and source cleanup.
- [x] Render linked confirmations, clarification and account, plan and limit guidance. Keep real thread headers and reply only to the authenticated From.
- [x] Verify the editable Topic Draft, refreshed signed confirmation, chat links as Sources, eligible podcast default and create-and-save retry. Maintain a standalone Topic creation path.
- [x] Run the final preflight, MCP and database smoke, docs and Nightshift builds. Preserve the manual QA data and attach the ship report.

### November 4 ship verification

Full preflight passed 3,578 tests across 598 files. Both MCP routes passed 271 assertions. The development persistence suite passed 213 assertions, including a real brew. A separate database test transferred an isolated Topic before a paid attempt and confirmed the former owner incurred no charge. Repeating a Topic Draft confirmation starts one brew and creates one Topic. The two bounded model evaluations passed all 12 summary cases and all three scoring cases.

The four topic picker states passed in Nightshift at 820 and 390 pixels. Component parity found 153 web/mobile pairs. Of these, 57 share a core component and 96 have documented exceptions. Both platforms implement all three counted Nightshift contracts. The docs build produced 23 pages, and the search index contains 140 sections. Both guides, the release preview and three documentation screenshots are available for review.

The owner chose to preserve existing development review items and older derived explanations with no recorded source-item link. Destructive conversion of those old copies is outside this release. The owner approved the MCP Apps naming audit, and the whole-codebase rename is implemented. Production rollout follows the review and archive.

On the iPhone 18 Pro, the on-device browser now opens with serializable search-row fixtures. The current expanded Personal sources item was inspected at the original Medium text setting and at Accessibility Extra Large. At the larger setting the section header wraps, the controls fit within the 402-point screen, and the scrollable story exposes the remaining content. The accessibility tree includes the full disclosure labels and item-specific Delete action. Both screenshots are in the ship handoff. The simulator's original setting was restored and the simulator shut down. A physical-device sign-in and production-host playback have no new verification in this change.

### Approved domain naming cleanup

- [x] Use `AiAgent`/`aiAgent` for connected AI identity, account, key, recommendation and consent names throughout the authored codebase. Preserve HTTP User-Agent and external platform paths.
- [x] Use summary and summarization for each sender's private Topic context. Preserve historical database identifiers, encrypted discriminators and the Temporal workflow alias required by stored data and running histories.
- [x] Use explicit `McpView`/`mcpView` names for MCP Apps components, helpers, files, build output and stories. Name declared HTML resources `UiResource`; use `mcp-views` for the capability. Preserve cached UI resource URIs, metadata values and host identities. Ordinary Nightshift cards remain cards.
- [x] Document these naming rules and compatibility exceptions in the domain-model skill and workspace guides.
- [x] Store the actual `personalSourceScoreBonus` of 0.10 or 0.05. The development migration preserved all 73 retained items, three legacy copies and 842 Finding scores, including the five converted bonuses.

Acceptance: no unexplained bare `Agent`, `Card` or `View` identifiers for these domain concepts; one source for score bonus constants; unchanged cached protocol values and retained data. Validate with `bun run check`, `bun run smoke:mcp`, `bun run smoke:personal-sources`, `bun run build:storybook`, and `openspec validate personal-sources --strict` after main-spec containment checks.

The final terminology review also fixed microsecond cursor precision with two live database assertions, removed a stale expiry claim, gated unavailable receiving instructions, and separated successful writes from refresh errors. The MCP view stories rendered after the rename; the final CodeRabbit and Gemini findings and dispositions are recorded in the ship report.
