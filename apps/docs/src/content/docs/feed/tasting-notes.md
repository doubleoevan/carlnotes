---
title: Tasting Notes
description: >-
  Write formatted notes on a topic or a team page, keep them private or share them, talk them over
  with your teammates in a comment thread, and see what changed since you last looked.
sidebar:
  order: 5
---

Carl writes what he found. **Tasting Notes** are where you write what you think about it. Every topic page has a Tasting
Notes section. Every team page has the same section, named **Team notes**. A note is formatted text with a comment
thread beside it.

The section lists the notes you can see in a table: each note's name, who can see it, and when it last changed. Sort by
any of the three. **Add note** opens a new one.

![The Tasting Notes table: each note's name, its visibility, and when it last
changed](../../../assets/screenshots/notes-section.png)

## Who can see it

Every note has one visibility. You set it when you create the note, and only the note's creator can change it later:

- **Private** — only you. Nobody else on the topic or the team sees it, whatever their role.
- **Team** — only the team holding the page.
- **Public** — everyone who can open the page.

Reading and writing follow different rules. Anyone who can read a private or team note can edit it, so a team note is
shared work. Everyone can read a **public** note. Only the page's owner and the team holding it can edit it, so the
public reads it and cannot change it.

Only a note's creator can change its visibility. Its creator or an administrator can delete it. Deleting a topic or a team deletes its notes too.

![The New note dialog: a name field and the visibility picker, which names who will be able to see
it](../../../assets/screenshots/notes-new-note.png)

## Saving

Open a note and start typing. A note has the formatting of a document: headings, lists, quotes, code, and links, from
the toolbar above the body or the usual keyboard shortcuts. There is no save button. The note saves itself a second
after you stop typing, and the footer reads **Saving…**, **Saved**, or **Not saved**. Opening a note shows what was
last saved.

Teammates share a note by taking turns. Nobody sees another person's typing live. If a teammate saved the note after you
opened it, your next save does not go through, so their version is never written over. Your words stay in the editor,
and a notice names who saved last and offers to reload. Copy anything you want to keep first, then reload to see their
version and add yours back.

Images are not kept in a note. Paste one and it is dropped on save. Lists are one level deep, so a nested list pasted
from elsewhere flattens, and a pasted table is not kept.

![An open note: the formatting toolbar above the body, the visibility picker top-left, and the comment thread beside
it](../../../assets/screenshots/notes-note-open.png)

## Comments

Every note has one comment thread. In a wide browser it sits beside the note. In a phone browser it slides up over the note. In the native app it appears below the body.
Each comment shows its author and when it was posted, and its author can delete it. Anyone who can read the note can
read the thread, and anyone who can write in the note can comment. In a browser, the speech-bubble button switches
between **Show comments** and **Hide comments**, so you can read the text on its own.

A comment is plain text about the note as a whole. A teammate's comment counts toward the unread count below until
you open the note.

## What changed since you last looked

If somebody else edited or commented on a note since you last opened it, the note shows a count. The count is the edits
and comments waiting for you. It appears in three places: on the note's own row, beside the name of the topic or team
holding it, and on your avatar in the header, as the total across everything.

Successfully loading the note records a read. Its count clears after the server accepts that read. Counts refresh every 45 seconds while the app is active and connected, and when you return or reconnect. A failed request keeps the last confirmed counts. Your own edits and comments never add to your count. An edited note counts once,
however many times it was edited.

## What notes are good for

The feed and [Coffee Talk](/docs/feed/chat/) are both about what Carl found. A note is the place for what you decided:

- **A running verdict on a topic.** Which findings mattered, and why the rest did not.
- **The brief behind the prompt.** What this topic is meant to catch, so the next person to [rewrite the
  prompt](/docs/topics/writing-a-prompt/) knows what it was aiming at.
- **A shared read of one week.** One team note per week, with everyone commenting on it, replaces the same
  conversation in five inboxes.

A note is yours to write. Carl does not read it, score it, or use it when he brews. Context that should change how a
topic is brewed belongs in [Attachments](/docs/topics/attachments/) instead.

## Notes in the mobile app

Topic and Team notes open inside the app. **Add Note** and the page name in the empty invitation open the same creation sheet. The full-width native toolbar sits below the title, above the body. Its orange scroll indicator shows that more formats are available sideways.
Use **Done**, shown below the body while the keyboard is open, to dismiss it. Notes save automatically. Comments appear below the note and keep your unsaved text intact.
Use the **X** in the top-right corner to close the note and return to its Topic or Team. On iPhone, you can also swipe right from the left edge.

Editors can rename notes. Creators can change visibility. Creators and administrators can delete notes after confirmation.
A reader sees the saved body and comments without editing controls.
Deleting your own comment also asks for confirmation. Choose **Keep it** to cancel or **Delete comment** to remove it permanently.

## Recovering a mobile draft

The app keeps pending edits on this device for the signed-in account. After a completed local write, they survive closing
the app. Open **Local drafts** on the Topic or Team to recover one without a connection. New notes and uncached notes need a connection.

Returning online retries pending notes, including ones you closed. If another client saved first, your draft stays visible
with a conflict notice. Copy what you need before choosing **Reload**. A failed Reload keeps your draft.

**Not saved** means the server has not accepted the latest text. A device-storage error means the draft is only safe in
memory until storage works again. Copy important text before closing the app in that state.

Successful sign-out, switching accounts, losing editing access, or deleting the note removes its local drafts.
Failed sign-out or deletion keeps them. Save or copy pending work before signing out or uninstalling the app.
