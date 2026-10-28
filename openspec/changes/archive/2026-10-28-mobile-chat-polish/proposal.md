# Proposal

## Why

Device review found small chat differences that make mobile harder to understand than web. Message deletion also needs confirmation on both clients.

## What Changes

- Share the web's random thinking lines and stable per-response selection with mobile. Add a native shimmer that respects Reduce Motion and app activity.
- Remove mobile's extra × beside the reply selector. Choosing “Replying to @all” clears the message reply and preserves the draft.
- Confirm message deletion on web and mobile using shared wording and existing platform controls.
- Fix the session-link alignment, remove the session pages' global footer, and let the logo open the existing homepage as a visitor. Public reading reuses the native feed and pages, with account actions still requiring sign-in.
- Match the Android localhost development API hostname to the OAuth callback so Google sign-in keeps its browser verification cookie.
- Restore Home's Reheat action, reuse the web's Source rows, and place anchored dropdowns above form sheets.
- Make note comments reachable through a labeled button and sheet, and make the title's pencil a standard actionable button.
- Keep embedded YouTube playback in the app; block player navigation that would leave the embed, without adding a separate external link.
- Restore the shared budget segment and legend colors in both clients' stylesheets, and align wrapped labels with compact row spacing.
- Rename the read-only note component from NoteStatic to NoteViewer in shared code and both apps.
- Keep the running review checklist in this change's tasks, adding new reports as they arrive and recording verification separately from implementation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-chat`: Shared thinking lines, native animation lifecycle, reply control parity, and confirmed message deletion.
- `mobile-sign-in`: Public visitor routes, session layout, and logo navigation.
- `team-chat`: Confirmation before deleting an individual room message on either client.

## Impact

The shared chat components and copy in `packages/core`, web chat and common components, and their native adapters change. Mobile session layouts, navigation guards, and visitor presentation also change. Server permissions and APIs remain the authority; visitor reading uses a separate memory-only query client. No native dependency changes are planned. Existing preview builds precede these fixes; a compatible preview update follows verification.
