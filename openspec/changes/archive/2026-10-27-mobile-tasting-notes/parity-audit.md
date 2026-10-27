# Mobile parity audit — October 27, 2026

The implemented mobile menu pages and their actions now share more of the web's composition and behavior. The audit also filled mobile visit analytics, native device attribution, and error-monitoring gaps. The user authorized archive, one commit, and push to main after the ship reviews; unrun acceptance remains listed below.

## Fixes from this pass

| Area | Result |
| --- | --- |
| Page actions | Both apps use core's `PageActionMenu`: page options, New topic when no equivalent button exists, Add to AI, Report issue. |
| Header menu | Both apps use `UserMenuItems` for route names, grouping, selected state, and Admin visibility. Native supplies matching Lucide icons. |
| Add to AI | Shared provider order, instructions, expansion, and copy feedback. Mobile supplies native icons, clipboard, storage, and a sheet. Desktop installation links remain on web; mobile offers copyable setup. |
| Account | Shared atomic budget/activity loading and retry. Failed refreshes preserve loaded content instead of showing incomplete totals. |
| Web loading failures | Teams and Profile expose retry instead of appearing empty or loading indefinitely. |
| Topic visibility | Native dropdown labels have sufficient width. Web and mobile use Lock, Globe, and Mail icons. |
| Team count copy | Native uses the shared singular/plural formatter. |
| Share → Report issue | Native retains one mounted sheet when switching content. The report question, input, Cancel, and Send report remain visible. |
| Telemetry | Shared visit semantics/privacy; native request attribution; platform/device/app dimensions; Sentry route errors, navigation, and isolated server request tags. |

The earlier implementation in this change also shares table composition and domain columns, Topic/Team form state and save helpers, Account fields and budget checkpoints, plan cards, footer content, note editing/comments, and loading skeletons. Native adapters retain system file/photo/time pickers and confirmations. Web's specialized nested membership rows retain their DOM implementation; native uses shared columns and detail sheets.

## Rendered checks

Compared the signed-in local web app with the iPhone 18 Pro simulator. These are observed checks, not a claim that every role and mutation was exercised.

| Surface | Checked |
| --- | --- |
| Home and menus | Shared action ordering, duplicate New topic suppression, Add to AI, menu destinations, Account selected state. |
| Topic | Loaded content, permission-gated action choices, direct Topic form, blank-title validation, readable visibility dropdown, sharing and report-sheet transition. |
| Profile | Identity/avatar affordance, own Topics and Teams tables. |
| Teams and Team | Page layout, New/Edit Team forms, Topic picker opening/cancellation, member table, add-member/add-Topic controls, action ordering. |
| Activity | Sections, anchored Rows dropdown, 5-row pagination, next/last-page states, fixed first column while dragging other columns, orange scroll indicator. |
| Account | Loaded budget and settings values against web; shared retry behavior covered by tests. |
| Plans | Monthly/yearly pricing and quota copy, current-plan disabled state. No checkout submitted. |
| Notes/comments | Owner creation, editing, format round trips, comments, and retained Finding position were checked earlier in this change. This pass did not repeat the full role/device matrix. |

The local web and native sort menus expose Relevance, Newest, and Trending. Source inspection covers filter/action hooks and permission gates. Full VoiceOver, large-text, light/dark, non-owner, and failure-recovery device matrices remain acceptance checks.

## PostHog and Sentry

- Native visits now send the web event names for Topic views, Finding source-title clicks, tagged CTAs, Topic/Team share choices, and actual tutorial playback. Screen views use `$screen` with route patterns.
- Existing server handlers emit business events once. Native API and auth requests carry bounded descriptive headers, correcting their previous web attribution. Web retains user-agent detection. Browser-hosted flows retain browser-session behavior.
- Event dimensions include `entryPoint`, `platform`, `browserPlatform`, OS version, device model, and app version/build where available. Client visits include development/production environment. Device headers affect telemetry only.
- Web and native share public Topic attribution and URL/path redaction. Topic/Team note paths omit parent and note IDs; queries and fragments are removed. Native anonymous IDs and queues live in memory; person profiles, replay, autocapture, and remote feature flags are disabled.
- Native Sentry records crashes, route render errors, and sampled navigation. It uses Expo Router's public navigation ref; the bundled SDK's internal router-store lookup is incompatible with the installed Router layout. The final app recorded navigation breadcrumbs during route changes.
- Sentry shares the server content redaction and adds native request-body/header, user identity, and navigation-parameter removal. Server request scopes keep simultaneous web/iOS/Android tags isolated, verified by a concurrency test.
- The development-only `Common/TelemetryCheck` sent labeled test events from the iPhone. Both SDKs reported successful flushes. This confirms the client delivery check; dashboard ingestion, grouping, source-map display, and filters will be checked after access is available. No deliberate native crash was triggered.

The mobile and web PostHog keys point to the same project. Mobile and server Sentry DSNs differ, so their dashboards must be checked in the configured projects. Keys and DSNs were not printed.

## Verification and remaining scope

The required `bun run check`, web build, Storybook build, iOS export, OpenSpec validation, and whitespace checks are recorded in `verification.md`. Targeted tests cover shared menus, Account retries, path privacy, device headers, credential preservation, native event redaction, and concurrent Sentry request isolation.

Deferred feature areas remain native podcast playback, chat, broader live badge counts, and Admin. Admin opens the hosted web page; it does not inherit the native SecureStore session and may need separate sign-in. Hosted legal/docs/Nightshift and billing flows intentionally reuse web destinations.

Android is deferred at the user's request. Non-owner device acceptance remains manual. Real report/invitation submission and account-setting changes were authorized, but this audit did not need to submit those mutations to establish the fixes above. It did not perform billing, credential changes, or account deletion. OpenSpec acceptance tasks remain open for unrun checks.

Only Admin currently reaches three nested table levels when counting the outer table: Users/Teams → Topics → Brew costs/Followers. Other inspected web tables reach at most two; mobile uses detail sheets where appropriate.
