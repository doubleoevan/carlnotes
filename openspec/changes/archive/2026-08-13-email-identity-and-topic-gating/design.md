## Context

The topic page's answer to "you may not see this" was one flat line, indistinguishable from a wrong id. Reading the actual failure modes: an invitee opening their own invite link with no session, a topic owner opening their own private link on a different browser, and a stranger who was handed a link that was never meant to leave the group it was shared in. The first two are recoverable if the page offers a way in; the third is not, and nothing about the fix should teach that stranger more than they already knew from having the link.

Building the gate surfaced two more findings. The share menu hid itself entirely on an invite or private topic, so the owner lost the one row — copy link — that actually works for an invitee. And the account had no way to change its email at all; the only remedy on record was an admin editing the database by hand, which is exactly how a duplicate account got created earlier.

## Goals / Non-Goals

**Goals:**

- A reader who may not see a topic gets a way in when one exists, and learns nothing when one does not.
- A user can change their own email without an admin.
- Every topic offers its share menu; only the rows that cannot work are turned off, and only on the topics where they cannot.
- Every CarlNotes email carries a plain-text part.

**Non-Goals:**

- A list of who has access to an invite topic. The gate says how it is gated, not who is on the list.
- Retrying a spent Turnstile token in place. A fresh token is cheap to issue and is what Cloudflare's widget is built to hand out.
- Redesigning the account page beyond adding the one new field.

## Decisions

**The gate discloses visibility, plus an invite topic's name, nothing else.** The topic route already collapsed "missing" and "not visible" into one 404 to avoid leaking a private topic's existence. That was worth keeping for a truly nonexistent id, but not for a topic that exists and is only gated: knowing whether a link is invite-only or private is what lets the page offer the right way in. An invite topic's answer also carries its name, drawn in the page's title slot behind the notice so the gate reads like the invitation that linked there — its owner hands that link out knowingly. A private answer carries no name, since a private topic's name alone can tell a stranger what its owner watches. `toGatedTopic` reads only those two columns, deliberately narrower than the full row `loadTopicPayload` would have read.

**Session state decides the message, not visibility alone.** A signed-out reader is told to log in or sign up, since an invitee is matched on their account email and may already have access under a session they are not in; a private topic's owner may be opening their own link on another device. A signed-in reader without access is told to ask the owner, since logging in again would not change anything for them, and offering it would read as broken advice rather than a real path.

**The gate keeps the page's own shape.** The skeleton stays behind the notice rather than the page collapsing to a single line, so a link pasted into a chat or a social platform still looks like CarlNotes and not a dead page. Closing the notice leaves for the homepage instead of dismissing into an empty page that never fills in, since there is nothing behind it to reveal.

**The share menu disables rows, not itself.** Hiding the whole control on an invite or private topic took away Copy Link, the one row that genuinely works for an invitee — that is what an invite link is for. Now every topic offers the menu, and only the rows that need a stranger to be able to open the link (the social platforms, the RSS feed, which the server refuses for anything but a public topic) are disabled, each explaining why by tooltip. The owner's tooltip doubles as a shortcut: clicking a disabled row opens the edit modal where visibility is set, rather than only naming the fix.

**The preview card is opened to every topic, deliberately.** A pasted link is already out in the open by the time anyone sees the card; a generic-looking unfurl for a gated topic would look more broken than an accurate one, and the case that would actually leak something — a stranger resharing someone else's private link — already had the link. This reverses the card route's previous public-only gate outright rather than layering a new condition onto it.

**Email change is two links, not one.** Better Auth's `changeEmail` supports sending straight to the new address, but that lets anyone holding a live session move an account to an address they control, unnoticed by whoever actually owns it. Confirming from the current address first is what makes the change visible to the account's real owner before anything moves; only then does a second link prove the new address is reachable at all.

**Every email gets a plain-text part.** `sendEmail` grew a `plainTextContent` field, and every render call generates the text form beside the HTML from the same props, so the two can never say different things. The auth emails moved onto one shared template rather than three near-identical inline strings, since a heading, one sentence, and a button is the same shape for a verification link, a reset link, and a change-email confirmation.

## Risks / Trade-offs

**A topic's gated visibility — and an invite topic's name — is now disclosed to anyone with its id.** Before, the same 404 covered both a wrong id and a real, gated topic. Now a gated topic answers 403 with `invite` or `private`, an invite answer names the topic, and only a truly nonexistent id stays a 404. This is a deliberate, narrow trade: knowing a link is gated (and how) is what makes the invitee and owner recovery paths possible, an invite topic's name is something its owner already distributes with the link, and a private topic's answer still reveals nothing beyond the word private.

**The preview card no longer refuses a private topic.** Before this change, a private topic's title could not be read through the card route at all. Now it can, by design — the alternative was a card that looked broken for exactly the topics whose owners are most likely to actually paste the link somewhere. Reversed the requirement outright rather than layering a new condition onto the old one, since the old reasoning (a session-less route should not leak a private title) is superseded by the product decision that the card is not the place drawing that line anymore.

**Two links to change an address is a slower flow than one.** Sending straight to the new address would move the account after one click. The confirm-then-verify order buys the visibility that keeps a hijacked session from relocating an account unnoticed, at the cost of a reader following two links instead of one.
