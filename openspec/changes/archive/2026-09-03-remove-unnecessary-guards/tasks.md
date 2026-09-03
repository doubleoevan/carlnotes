## 1. Invite links: the growth path

- [x] 1.1 Remove the bot check from the acceptance route and the widget from the invite page
- [x] 1.2 `createTopicInvite`/`createTeamInvite` return the target's newest live link instead of
      inserting a duplicate; the daily quota is only checked when a row is actually written
- [x] 1.3 `linkInviteMaxUses` in `shared/plans.ts` (free 25, plus 100, premium 250), read from the
      creator's plan at creation
- [x] 1.4 A link whose Topic is currently public is accepted past its expiry and use count, and its
      preview stays live, since Follow already grants the same
- [x] 1.5 An expired or exhausted team link downgrades to a join request instead of a rejection
- [x] 1.6 `teamFull` acceptance status, so a full team is named as full instead of "used up"
- [x] 1.7 The exhausted page for a private topic tells the visitor to ask the inviter for a fresh link
- [x] 1.8 The api clients return "limited" on the 429 and the invite editors and share sheet show
      "Daily invite limit reached" copy instead of generic failure
- [x] 1.9 Closing an invite link is removed outright: the control, its route, the rejection reason,
      and the `revoked_at` column, since a link that stops working with no explanation reads as a bug

## 2. Teams

- [x] 2.1 Remove the last-led-team block; deleting an empty led team deletes it
- [x] 2.2 Deleting a populated led team hands leadership to the oldest active member when no other
      leader remains, and the caller leaves; the UI names the new leader

## 3. Guards that defend nothing

- [x] 3.1 The profile topic table and the profile/team preview counts drop the 3-findings filter;
      Featured/Popular and the sitemap keep it
- [x] 3.2 The share control renders on a private topic's feed card, disabled-with-reason like the
      topic page
- [x] 3.3 Sign out happens in one click; the confirmation dialog goes
- [x] 3.4 Bookmarking works for team members from both the feed and the topic page

## 4. Honest failures

- [x] 4.1 The room 20-file limit answers with its own error and the UI names the number and recovery
- [x] 4.2 The room file picker toasts when it drops over-limit files, like the topic-chat picker
- [x] 4.3 Send works with attachments and no text in both composers, and the payloads allow it
- [x] 4.4 Email verification links live 24 hours and the email names the window
- [x] 4.5 A failed link preview retries after 15 minutes instead of 24 hours
- [x] 4.6 History answers validate up to a constant sized to the generator's worst case
- [x] 4.7 Chat questions get the room message's 4,000 characters
- [x] 4.8 The room composer rescues an over-limit paste into a text attachment, like topic chat
- [x] 4.9 PDFs share at the upload size, under their own constant
- [x] 4.10 A note update rejected by size stops retrying and tells the user; the bound rises to hold
      one large paste
- [x] 4.11 A chat attachment clipped for context length gains the marker naming its full length
- [x] 4.12 Send-style share targets are live wherever copy-link is

## 5. The gate

- [x] 5.1 `bun run check` green
- [x] 5.2 Docs that state the old behavior updated
