---
title: Personal sources
description: Send selected AI summaries, import conversations, and forward new email into any Topic you can edit.
sidebar:
  order: 4
---

Personal sources are the chats and emails you send to a Topic, along with any conversations you choose to import. Carl uses them to pick relevant findings when he brews.

[Send AI chats to CarlNotes](/docs/topics/send-ai-chats-to-carlnotes/) · [Send emails to CarlNotes](/docs/topics/email-carl/)


## Choose a Topic you can edit

AI Agent and Email sends work on any Topic you can edit, including public, private, invite, and Team Topics. The text and links contribute only to that destination Topic.

Your items and private Finding annotations are visible only to you. Carl keeps a separate private summary for scoring. Topic owners, other editors, and administrators cannot read another sender's Personal sources. Public explanations use the linked page alone. Coffee Break episodes narrate only those public explanations. Topic sharing and ownership controls keep their ordinary behavior.

Open **Personal sources** in **Topic info** or **Artisanal Blend** after your first send. **Only you can see this** means the items belong to you, even on a shared Topic. Expand an item to read its text and links or delete it. The newest items come first, five per page.

A link marked **Next brew** is waiting for review. When a link becomes a Finding, it opens Carl’s note right there. Other links open the original page. Personal sources leave all ten fetched Source slots available.

## Send from a connected AI app

1. [Connect your app](/docs/account/add-to-ai/).
2. Ask **Send this chat to Carl**. The app writes a concise summary with your work, conclusions, open questions, and useful links. It does not paste the raw conversation.
3. If you named no Topic, choose destinations in the Topic picker. Named Topics go straight to the send.
4. Check the saved confirmation and its linked Topics. A send to several Topics counts once.

A send has a title of at most 200 characters, a summary of at most 2,000 Unicode characters, and at most ten public
HTTP(S) links. When the connected app supplies a conversation URL, the full date, AI platform icon, and name in the expanded item link back to it with a launch icon. The reference stays encrypted and sender-only, outside matching and crawling. Apps that supply no URL show a plain platform label. CarlNotes never invents a URL or publishes a shared chat to obtain one. CarlNotes cannot
read your assistant's history, memory, or uploaded files through MCP. It receives only the tool arguments the app sends.

Every plan shares the same provisional ceiling of 200 accepted sends per UTC day across AI Agent sends, API keys, and emails. It exists solely to stop runaway agents. A multi-Topic send counts once. At the ceiling, Carl says “The day's limit is reached.” The count
resets at midnight UTC. Topic suggestions, refused requests, and duplicate retries consume none. Deletion does not refund
an accepted send. Premium [send-only API keys](/docs/account/add-to-ai/#send-only-api-keys) use the same service.

The picker can suggest an app after three matching accepted sends within 30 days. It compares your current description
with saved titles and summaries. It never inspects the assistant account or adds a Source automatically.

## Import selected conversations on the web

Choose **Import conversations**. Pick a ChatGPT or Claude JSON export, its ZIP container, or paste a transcript.
The browser parses it locally and previews conversations. Nothing is selected initially. Select what you want and
confirm the import. Only selected text uploads.

Supported exports contain ChatGPT's conversation message trees or Claude's conversation and text-message records.
Unknown formats are refused; paste the visible text instead. Attachments, tool output, hidden messages, and non-text
parts are excluded. Private conversation references stay separate from public links.

The input, expanded ZIP content, and selected upload batch each have a 10 MiB limit. Exports can contain up to 1,000
conversations. Password-protected archives and unsafe paths are refused. Closing the preview cancels parsing and
releases its buffers. A confirmed upload must finish before the dialog closes.

Imports work on every plan, need no OAuth connection, and use neither daily allowance. They remain until deletion.
The iPhone and Android apps can read and delete imported entries; export selection is web-only.

## Email Carl

Write to **the address Carl sends your digests from**, using your CarlNotes account email. Tell him what you're working on and include useful links. An optional `topic: <Topic name>` in the subject or first line helps him find a match.

Carl saves clear matches to Topics you can edit and sends a confirmation with links. If he needs clarification, he replies in the same thread with numbered suggestions. Reply with numbers, existing Topic names, or a mix. Clear fuzzy names work; ambiguous names need clarification. No email body is copied into a pending store.

Email Carl requires Plus or Premium and shares the daily send allowance with AI chat sends. One email counts once across several Topics. See [Email Carl](/docs/topics/email-carl/) for the full guide.

## Context, retention, and deletion

AI sends, emails, and imported conversations stay until you delete them. CarlNotes encrypts entry titles,
text, sender details, links, private references, and derived context in storage. Only you can read your items. The API also restricts private annotations to their sender. The summary stays internal.

Carl summarizes at most 80,000 characters into at most 8,000 characters of private context. Large imports may exceed that reading allowance. Summarization uses the Topic owner’s model budget. Missing keys, exhausted budgets, and failures
show a status. Accepted text can help a later brew once rebuilding finishes.

Private context helps relevance scoring on its destination Topic. For each sender, one model call selects exact excerpts from the linked page for the public explanation and writes that sender’s private annotation. Another sender’s private text never enters the same call. Finding views, shared feeds, copied public notes, email digests, and podcasts use only the public explanation. It is excluded from external search queries, shared Resource fields and
vectors, and model content traces. Model providers still process text needed for summarization and scoring; their
retention terms apply. Resend independently processes and retains received email under its own terms.

Deleting an entry removes its unused links and invalidates old private context. The next rewrite uses only live
entries. Deleting a Source removes all your entries from it. Deletion also invalidates your derived Finding annotations. Existing Findings stay. Revoking
an app or key stops future sends; it does not delete saved content or provider copies. See the
[privacy policy](/privacy#personal-sources-data).
