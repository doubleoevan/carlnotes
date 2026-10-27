# Proposal

## Why

Mobile lists Tasting Notes but sends users to the web to read or change them. Complete native reading and writing together, including the remaining reading work from Prompt 45, without creating another UI to maintain.

The approved scope now also includes the remaining mobile menu pages and their forms. Reuse web composition, clients, vocabulary, and Nightshift styling across both apps.

The user also requested a final page/action parity audit and mobile PostHog/Sentry coverage, with posting checks now and dashboard confirmation later.

## What Changes

- Open Topic and Team notes in a native screen using the web's `react-native-enriched-html` editor and display component, HTML format, and Nightshift styles. Show the complete comment thread below the note, including for users without edit access.
- Replace note creation handoffs with a native sheet. Match web permissions: editors rename, creators change visibility, and creators or admins delete after confirmation. Support plain-text comments through existing clients.
- Extract the existing toolbar's formats, labels, state mapping, and portable composition into shared modules. Reuse note comments, conflict notices, saving, table composition, and badge presentation through small platform adapters.
- Keep the one-second save debounce and version conflicts. Flush on backgrounding and preserve account-owned drafts across app restarts, with reconnect saving and cleanup on session exit or confirmed deletion.
- Connect native note and Topic unread counts to the shared badge store and server read records. Clear counts across clients through the existing read and refresh paths.
- Add native Markdown sharing for Finding notes without closing the Finding sheet. Preserve source opening through Expo's browser and shared Finding handlers.
- Give web and mobile recap rendering one pure parser-based safety policy. Preserve allowed citations, inert disallowed destinations, compact display headings, and the existing web appearance and tests.
- Record why the current Markdown renderer, recap placement, and source-opening semantics supersede the earlier Prompt 45 proposals. Carry the outstanding iOS and Android checks into this change.
- Add native Profile, Teams, Team detail, Activity, Account, and Plans pages with shared table composition and existing API clients.
- Give web and mobile shared Topic, Profile, Teams, Activity, Account, and Team loading skeletons with reduced-motion support.
- Connect Topic and Team forms, invitations, membership actions, attachments, avatars, account preferences, and reporting. Preserve successful partial writes when a retry is needed.
- Fix the first table column while the remaining columns scroll. Keep an orange overflow indicator, anchored Rows dropdown, and web pagination rules.
- Reuse the web footer across scrolling pages. Open hosted information, legal pages, and Nightshift in a dismissible system browser view.
- Retain explicit web handoffs for Admin, hosted billing, podcasts, and chat. Broader live badge counts remain separate work.

## Capabilities

### New Capabilities

None. Existing note and reading capabilities own these behaviors.

### Modified Capabilities

- `tasting-notes`: native Topic and Team note reading, creation and editing; shared toolbar; keyboard and style parity; local drafts distinguished from the canonical server body.
- `tasting-note-sync`: background saves, durable account-owned drafts, reconnect, conflict preservation, and cleanup.
- `tasting-note-comments`: native comments below the note, shared presentation and existing posting/deletion permissions.
- `note-badges`: mobile counts, acknowledged reads, cross-client refresh, and account isolation.
- `mobile-feed`: Finding sharing, recap placement, source-open semantics, native menu pages and forms, shared tables, page loading skeletons on both platforms, and the global footer.
- `injection-defense`: a shared parser-based recap safety policy consumed by both app renderers.

## Impact

Implementation touches `apps/mobile`, the matching web note and recap components, and universal `contracts`, `client`, `core`, and `nightshift` modules. No database migration or API endpoint change is planned; client error handling needs more precise outcomes from existing responses.

Mobile adds the editor package already patched for web and native photo, document, and time pickers. These require a rebuilt development client. Core owns shared page/table composition and form behavior; platform adapters own navigation, storage, and system controls.

Documentation covers the workspace guides, Tasting Notes help, and the Notion Mobile reading decision. Acceptance requires `bun run check`, web regressions, native stories, and actual iOS and Android runtime checks. Bundle exports alone do not complete verification.

The user deferred Android testing and assigned team-editor, read-only, and admin device checks to manual acceptance. Keep those checks open rather than claiming full platform acceptance.
