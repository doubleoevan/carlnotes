## Why

A reader who opened a topic they could not see got "Carl couldn't find this topic," the same line whether the id was wrong or the topic was real but gated. That answer is honest about privacy, but it cost real access: an invitee clicking their own invite link with no session, or a topic owner opening their own private link on a second device, both read it as broken and had no way in from the page itself.

A password had no way to be changed at all. Every user was permanently stuck with the address they typed at signup, and the only remedy was an admin editing Neon by hand.

Inviting someone to a topic also told them nothing: the invite wrote a row and waited for the owner to pass the link along themselves. The invitee — with an account or without one — was never notified, and received invitations surface nowhere in the app, so an invite the owner forgot to follow up on simply never happened.

Two smaller bugs surfaced while building the above. Cloudflare Turnstile tokens are single-use: a form that failed for any reason other than the token itself was left holding a spent token, and every retry failed until the page was refreshed. And the transactional auth emails were a bare link with no plain-text part, which reads as a spam signal to most filters.

## What Changes

- A signed-in user changes their email from the account page. Better Auth's two-link flow authorizes the move from the current address, then confirms the new address is reachable, so a stolen session cannot move an account silently and a typo cannot silently break delivery.
- A reader who opens a topic they may not see gets a notice instead of a dead end: what gates it, and a way in when one exists. A signed-out reader is offered to log in or sign up, since they may already have access under an account they are not signed into; a signed-in reader without access is told to ask the owner instead, since signing in again would not help them.
- The share menu is offered on every topic regardless of visibility. The rows that need a stranger to open the link — posting to a platform, the RSS feed — are disabled on a topic where they cannot work, with a tooltip explaining why; the owner's tooltip is a shortcut into the edit modal.
- The link-preview card renders for every topic, not only public ones, so a pasted link never looks broken to whoever it reaches.
- A Turnstile token is renewed after any failed submission, so a form that failed for an unrelated reason does not need a manual page refresh to try again.
- The verification, password-reset, and email-change links move onto a shared template with real body copy, and every email CarlNotes sends now carries a plain-text part alongside the HTML.
- A new topic defaults to invite visibility, so sharing with a few people is the path of least resistance. A newly added invitee is emailed their invitation: the owner's username, the topic, and a link to its page, where the gate walks a signed-out invitee through signup and back. Only newly added addresses are emailed, so re-saving a topic never re-emails its list, and subscribing stays the invitee's own call on the topic page. The link carries a `src` marker the gate forwards as the signup cta, so signups an invitation converted are counted as such.
- The invite gate leads with Sign up as its primary action, Log in quiet beside it, and no close ✕ or leave button; a private gate offers Log in alone, since a fresh account can never see a private topic. An invite topic's name shows in the page's own title slot behind the notice — a private topic's name is never revealed.
- The topic page info card lists the findings numbered under Carl's Notes, inside the Read more clip — the scan email's list in app form, with each finding's relevance explanation inline where the feed keeps it behind a hover a phone does not have. Every notes scroll box floats a Copy Markdown for AI control that hands the clipboard the linked topic title, the prompt, the note, and the findings as Markdown links.
- An admin can read any user's Activity and Account pages from the admin table, read-only and behind the console's gate, each page carrying an identity row that links on to the profile. The profile's owner sees all their own topics there, non-public ones muted under a Visibility column strangers never get.

## Capabilities

### Modified Capabilities

- `user-auth`: a signed-in user can change their email; a Turnstile token is renewed after a failed submission
- `topic-detail-page`: a gated topic answers with how it is gated instead of a flat not-found, and offers a way in
- `social-sharing`: the share menu and the preview card are offered for every topic, not only public ones
- `topic-editing`: saving a newly added invitee emails them their invitation
- `activity-page`: the topics table counts the emails each topic's owner received this month in a sortable Emailed column, shown on the admin subtable too; the page names whose it is and disables every control when an admin reads somebody else
- `admin-console`: a user row links into that user's read-only Activity and Account pages, served behind the console's own gate
- `public-profiles`: the owner sees all their topics with a Visibility column and muted non-public rows, while strangers keep seeing public topics only

## Impact

- `api/auth.ts`, `emails/auth-email.tsx` (new): the change-email flow and the shared auth-email template
- `worker/email.ts`, `worker/notify.ts`, `emails/topic-scan-email.tsx`, `emails/manual-scan-email.tsx`: a plain-text part alongside every email's HTML
- `ui/src/components/session/TurnstileWidget.tsx`, `ui/src/pages/SignupPage.tsx`, `ui/src/pages/ResetPasswordPage.tsx`: token renewal after a failed submission
- `api/topic/topics.ts`, `ui/src/lib/topicClient.ts`, `ui/src/pages/TopicPage.tsx`: the gated-topic notice and its signed-in/signed-out copy
- `emails/topic-invite-email.tsx` (new), `api/topic/topics.ts`, `worker/email.ts`: the invitation email, sent to newly added invitees after a save commits
- `ui/src/components/topic/ShareTopic.tsx`, `TopicInfo.tsx`, `TopicInfoCard.tsx`: the always-offered share menu with row-level disabling
- `api/share/preview.ts`: the preview card opened to every visibility
- `db/schema.ts` (`topic_email_sends`, one migration), `worker/email.ts`, `worker/notify.ts`, `api/activity.ts`, `ui/src/components/table/TopicsTable.tsx`: accepted sends recorded per topic and counted in the Emailed column
