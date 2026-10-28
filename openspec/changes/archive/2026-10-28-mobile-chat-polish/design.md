# Design

## Context

See `proposal.md` for the reported gaps. `ThinkingLine` and its phrase deck currently live only in web. Mobile's waiting bubble uses `CoffeeLoading`. Both room-message adapters call deletion immediately. Mobile adds a reply-cancel button that web does not have.

## Goals / Non-Goals

Share phrase selection and waiting-line composition through core. Reuse web's `ConfirmDialog` and the native alert convention already used for comment deletion. Keep chat permissions, API calls, and accepted-state refresh behavior intact. This pass does not add voice, attachments, or another backend.

## Decisions

- Move the phrase deck and its shuffle into `packages/core/lib/thinkingLines.ts`, with selection tests. Use a portable `ThinkingLine` component with an app-supplied text renderer. Web retains its CSS shimmer; mobile supplies native text and motion.
- Use the existing native animation runtime for a moving highlight over the text. Run transforms without per-frame JavaScript, stop on inactivity and cleanup, and show static text with Reduce Motion. Avoid adding a native dependency and requiring another binary solely for this effect.
- Remove the extra reply-cancel control. The existing selector's @all handler already clears the parent reference and preserves draft text.
- Put confirmation wording beside the existing deletion notices in `core/lib/chatCopy.ts`. Adapt confirmation to web's dialog and the native alert. Share accepted refresh, failure notices, and retired-conversation guards in `core/lib/chatRoomActions.ts`.
- Keep new review reports in `tasks.md`. Mark implementation and verification separately; add requirements here when a report changes behavior.
- Center the session prompt beside its existing 48-point link and remove Footer from SessionScreen. These shared native components cover sign-in and sign-up together; the web's session routes already omit the global footer.
- Let visitors reach Home, Search, and public Topic/Profile/Team/note pages through the existing native routes. Reuse core's feed query with a null account identity in an isolated memory-only query client. Retired sessions cannot mount public reading while their old cookie is being removed. Account, activity, personal team lists, settings, and chat remain guarded.
- Select Featured for the public feed, which has no Yours section. Use the existing shared visibility and action rules for visitor filters, Topic actions, and note permissions. Hide per-account finding controls; account-dependent creation/join/team actions lead to sign-up. The visitor menu provides native Log in and Sign up links.
- Normalize the development server's IPv4 loopback hostname to localhost when choosing the API URL. Better Auth's Expo proxy sets the browser cookie on the API hostname, while the local Google callback uses localhost. The two must match. Keep production and LAN destinations unchanged, retain state validation, and document both API and web callback port reversals for Android.

### Additional device review fixes

- Home passes Reheat with Lucide Coffee to the existing shared PageActionMenu and calls the existing feed reheat handler.
- Move TopicSource and TopicDefaultSource composition into core, with stable DOM and native element adapters. Move
  the staged Source summary formatter there too. This is actual component reuse, distinct from the already shared
  form hook. Native Badge/Button replace DOM nodes; native summaries wrap because touch has no hover tooltip.
- Mount the anchored-control PortalHost after the modal sheet provider. Its former position put dropdown content
  beneath the provider's sheets on Android. Keep the existing Select component and verify the InSheet story.
- Put a visible Comments button beside Close. Open the same shared NoteComments component in the existing native
  Sheet, with BottomSheetTextInput for keyboard avoidance. Preserve editor/controller identity while the sheet opens.
  Web's phone layout already opens a comments sheet; its desktop margin column stays intact. Keep read-only permissions.
- Use the standard native ghost Button for the title pencil and focus the existing name input. Use foreground
  contrast for that action and Close. Delete and visibility already use standard Nightshift controls.
- Retain react-native-youtube-iframe. Override its WebView navigation and popup handlers so playback cannot launch
  another app implicitly. Allow only its exact player document and HTTPS YouTube embed frames. Show failures inline
  without a separate Open on YouTube link. Match web's red tutorial play button and dimmed orange preview button.
  Native SVG and WebView adapters provide the platform rendering; web's iframe stays unchanged.
- Both stylesheets explicitly scan the shared spend-meter model for its color classes. The native and web legends
  wrap whole dot/label groups with a smaller vertical gap. Missing dots previously left blank space before labels.
  Cutoffs continue to use the API's authoritative list; admins without overrides intentionally receive none.
- Name the read-only note component NoteViewer in core and both app adapters, including matching stories. The
  component remains live and can show comments; the name describes viewing instead of editing.

- Account for the open keyboard in Select's collision insets. Keep every option above the keyboard while the composer remains focused.
- Use 48-point chat action boxes instead of overlapping hit slop. Keep the web icons and order; larger native targets are an accessibility adaptation.
- Give ChatAuthor and link previews explicit available width so a YouTube thumbnail does not collapse to its icon width.
- Keep handled taps active in sheet scroll content so the first press posts a comment while the keyboard is open.
- Match the chat status-bar text to the current card palette.
- Refresh the session after social sign-in returns. The session store updates asynchronously and must not trigger a false failure after a successful callback.

## Risks / Trade-offs

- Native text wrapping can misalign an animated overlay → use the same measured width, font, and text in both layers; check enlarged text and hide the visual duplicate from accessibility.
- An animation could continue while hidden → stop it on app inactivity and unmount; no repeated JavaScript timer drives frames.
- A pending or failed deletion could hide the message too early → retain existing server-accepted refresh and error behavior; verify Cancel and Confirm separately.

## Migration Plan

Run the repository gate and rendered web/Android checks, then publish a compatible preview update if its runtime matches the new binaries. The initial iPhone and Android builds precede these fixes. No data migration is needed; preview rollback restores the previous JavaScript update.
