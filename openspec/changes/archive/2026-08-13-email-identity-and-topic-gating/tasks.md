## 1. Changing an email

- [x] 1.1 Enable `changeEmail` on the Better Auth instance, sending the first link to the current address
- [x] 1.2 Build `emails/auth-email.tsx`, one template shared by verification, reset, and change-email confirmation
- [x] 1.3 Add the Email section to the account page, with the same "check your inbox" reply on a taken address as a free one
- [x] 1.4 Give every email a `plainTextContent` alongside its HTML, generated from the same props so the two never disagree

## 2. The Turnstile single-use bug

- [x] 2.1 Add a `spentTokenCount` prop to `TurnstileWidget`; raising it issues a fresh challenge in place of the spent one
- [x] 2.2 Wire signup and password-reset-request to renew the challenge on every failure path that is not a created account or a sent link

## 3. A gated topic offers a way in

- [x] 3.1 Add `toGatedVisibility` to `api/topic/topics.ts`, reading only the visibility column of a Topic the caller may not see
- [x] 3.2 Answer `403 { gatedVisibility }` for a gated Topic and a bare `404` for one that does not exist
- [x] 3.3 Thread the result through `fetchTopicPage`'s return type so the ui can branch on visible / gated / missing
- [x] 3.4 Add the gate notice: the page's skeleton behind it, copy branching on session state, both CTAs carrying a return path
- [x] 3.5 Add the return path to signup, which had none before this

## 4. The share menu and preview card open to every visibility

- [x] 4.1 Extract `TopicShareControl` so the topic page and the info card render one share control instead of two independent ones
- [x] 4.2 Disable the share-platform rows and the Copy RSS row on a Topic where they cannot work for a stranger, each with a tooltip
- [x] 4.3 Route a disabled row's click to the edit modal for the Topic's owner
- [x] 4.4 Open `toPublicTopicPreview` to every visibility instead of refusing anything but public

## 5. The invitation email

- [x] 5.1 Build `emails/topic-invite-email.tsx` on the shared one-link template: the owner's username, the topic, a link to its page, the invited address it is tied to, and an invitation's own closing note
- [x] 5.2 Add `topic-invite` to `EmailKind` and send after create and update commit, fire-and-forget like the first scan
- [x] 5.3 Email only newly added addresses on an edit, diffing the payload against the stored invite rows before the save
- [x] 5.4 Rework the gate's actions: Sign up primary with Log in beside it on invite, Log in alone on private, no ✕ (`hideCloseButton` on the dialog primitive), no Back button for a signed-out reader
- [x] 5.5 Show an invite topic's name in the skeleton's title slot behind the gate, returned by the gated api answer for invite only, never private
- [x] 5.6 Stamp `src=invite-email` on the email's topic link and forward it (or `gate`) as the signup cta from the gate's Sign up action
- [x] 5.7 List the findings numbered with their relevance explanations under Carl's Notes in the info card, inside the Read more clip
- [x] 5.8 Add `topic_email_sends` with its migration, record accepted sends from the scan, manual, and invite senders, and sendEmail returns whether resend accepted
- [x] 5.9 Add the sortable Emailed column counting the owner's received sends by recipient, with its totals-line sum, to the shared topics table the admin subtable reuses
- [x] 5.10 Word every totals-row figure with its noun, N/M for the toggle and visibility shares, rename the drill-down's Notes column to Brew time with a tooltip, tooltip the cost-cell trigger, page the scans drill-down, and give scrolling tables the notes box's thin scrollbar
- [x] 5.11 Serve another user's activity and billing state to an admin by id behind the console gate, with the payload naming whose it is
- [x] 5.12 Generalize the topic byline into UserProfileLink and render the identity row on the Activity and Account pages
- [x] 5.13 Disable every control on a foreign Activity or Account page: toggles off, deletes and settings and portal buttons absent
- [x] 5.14 Link the admin row's username to the user's activity and its email and plan to their account, each with its named tooltip
- [x] 5.15 Show the invitee's avatar and username in the invitations table once the address has an account, opening their profile in a new tab
- [x] 5.16 Give the profile owner all their topics with a muted-row Visibility column and N/M public total, strangers unchanged
- [x] 5.17 Default a new topic's visibility to invite in the Add topic modal
- [x] 5.18 Float a Copy Markdown for AI control on every notes scroll box, copying the linked topic title, prompt, note, and finding links, confirming as a checkmark

## 6. Verification

- [x] 6.1 Drive the full two-link change-email round trip against real Better Auth tokens, including a canonicalized address written the awkward way
- [x] 6.2 Confirm a request to an address already in use answers identically to one that is free
- [x] 6.3 Render the auth-email template both ways and confirm the plain-text part carries the link and no markup
- [x] 6.4 Exercise all four gate states in the browser against real topics: signed-out and signed-in, invite and private
- [x] 6.5 Confirm the share menu's disabled rows, tooltips, and owner shortcut against a real invite Topic
- [x] 6.6 Confirm the preview card renders for public, invite, and private Topics, and 404s for a nonexistent one
- [x] 6.7 Preview the invitation email in the react-email dev server, html and plain text both
- [x] 6.8 `bash scripts/preflight.sh` green
- [x] 6.9 Verify the admin drill-ins, read-only foreign pages, profile visibility column, and the diary's per-scan numbered findings in the browser
