## Context

The chat has three conversations today: a user's private chat about one Topic, a user's private chat about one Team, and the Team chat rooms. Every one is bound to something that already exists. The panel opens on the busiest chat room, or on the page's Topic, and when a signed-in user has nothing to open it shows a "start a topic" call to action with a New Topic button that opens the editor modal.

The Topic Tools from `mcp-server-topic-tuning` give Carl `updateTopicPrompt`, `addTopicSource`, and `removeTopicSource`, each with the gate check inside, bound to a Topic by the chat and offered as arguments over MCP. Their adapter counts calls and notes saves for the toast.

Creating a Topic runs through `createTopic` in `api/topic/topics.ts`: the `topic:create` gate, the daily-frequency check, the invitee check, one transaction for the row, its first Prompt Version, the owner's subscription, the invites, the Sources, and an open first Scan, then the screening and the Scan hand-off. The editor's Recommend button asks `POST /api/topics/suggest-sources`, which verifies every suggestion and draws on a daily suggestion limit instead of the scan quota.

## Goals / Non-Goals

**Goals:**
- Carl makes a Topic in a conversation: title, prompt, Sources, optional invites, one yes, one save
- The save is the editor's own create path, so nothing about a Topic differs by how it was made
- A fresh signup lands in that conversation with the panel already open
- The conversation is one turn away on every page for a signed-in user

**Non-Goals:**
- A Topic made for a Team from the chat. The team page keeps the team chat as its default and reaches the new-topic chat through the menu
- Wizard steps held as state. The steps are Carl's, in words, and a user may skip or reorder them. Only the draft is state
- Any change to the editor modal or the Recommend button

## Decisions

### One more conversation, bound to nothing

The chat page gains a third kind: `{ newTopic: true }` beside `{ topicId }` and `{ teamId }`. Its rows in `chat_turns` have no Topic and no Team, which the table already allows, and its filter is both columns null for the user. The routes mirror the Topic conversation's: `GET`, `DELETE`, and `POST /api/chat/new-topic`, the last under the caller rate limit. Authorization asks for a session, the monthly spend budget, and `chat:persist`, the same way the Team conversation does. The conversation payload includes `isFirstTopic`, whether the user owns no Topic yet, counted on the server so the placeholder is right on every page.

*Alternatives.* Reusing the Team conversation with no Team: its prompt reads across a Team's Topics and would need a second empty state. A separate table: every conversation is already one ledger, and the spend meter reads it once.

### The wizard is a prompt, not a state machine

A new `chat-new-topic.md` prompt makes Carl the guide. It tells him the order: ask what the user wants to follow, propose a title and a prompt in their words, call `suggestTopicDraftSources` with that title and prompt and offer what comes back, ask whether anyone should read along and whether there are files worth attaching, and write each settled answer into the draft with `draftTopic` as he goes, then say exactly what he would create and wait for a yes. The draft card beside the chat is the form filling in. It has the same honesty rule the edit block has: only a tool call in this turn is a save. The client holds no wizard state. A user who answers three questions at once skips ahead, and one who changes their mind goes back by saying so.

The reply path gains a third branch in `streamChatReply`: no findings, no Sources, no scan notes, only the docs block, so an app question still gets an answer. The web search tool stays on, so Carl can check a site or a feed the suggestion flow did not offer.

### The Topic Draft is the form, and the browser holds it

The new-topic chat holds one Topic Draft: a name, a prompt, Sources as source option and value pairs, invite emails, and the files the user attached. The browser holds it and sends it with every turn, the prompt shows it to Carl fenced as untrusted, and a `draftTopic` tool lets Carl write any of its fields, so the tool calls the reply stream ends with bring the draft back and the panel shows it as a card above the composer. The card is what will be saved, so `createTopicFromDraft` takes no arguments in the chat: it saves the draft the turn was sent with, as Carl last wrote it. A reload loses an unsaved draft, and Carl writes it again from the conversation.

Files attached in the new-topic chat reach Carl for that turn like any chat attachment, and the browser keeps the file itself in the draft. Once the Topic exists, the browser uploads each file through the topic page's own upload route, so screening and the attachment context run as they do for a file dropped on the page, and the page reloads when the uploads finish. Pasted text is not a file and is not uploaded. The attachment limits are the topic page's, and a rejected upload toasts its reason.

*Alternatives.* A server-side draft row: another table for something the conversation already holds, and the stateless turn stays stateless. Moving chat attachments into topic attachments: two tables with two screenings, and the upload route already does the second one.

### Two more Topic Tools, the create path shared with the editor

`createTopicFromDraft` in `api/tool/topicTools.ts` takes the user and a Topic Draft. It builds the editor's create payload with the editor's defaults: weekly on Wednesday at 09:00 so brews spread across the week, invite visibility, ten results, no tags, the default Sources plus the chosen ones built through the shared registry. It then calls `createTopic` in `api/topic/topics.ts`, which gains an origin for the first Prompt Version, so the gate, the daily-frequency check, the invitee check, the first Scan, and the `topic_created` event are the editor's own. The tool returns created with the Topic's id and name, or the create path's own rejection: quota, a daily-frequency limit, or an invitee the app will not invite, each in words Carl repeats. An invitee rejection leaves nothing written, and Carl offers to drop the invites and save again. The conversation payload and every turn's prompt say how many more Topics the plan holds, so a user at the limit hears it in Carl's first line and sees it above the composer, instead of after the whole wizard.

`suggestTopicDraftSources` takes a name and a prompt and returns what the editor's Recommend button would, through `suggestSources` in `worker/suggest.ts` with the user's own key and the same daily suggestion limit. Each suggestion names the source option and the value the draft takes, so Carl writes the ones the user picks into the draft.

`savePromptVersion` moves to `api/topic/promptVersions.ts`. `api/topic/topics.ts` imports it there, and `topicTools.ts` imports the create path from `topics.ts`, so the modules stay acyclic.

### The tool calls the stream ends with become an object

The tool calls the private reply stream ends with grow from a list of saves to `{ topicSaves, topicSaveRejections, topicDraft, createdTopicId }`. The chat client toasts the saves as before, replaces its draft when one comes back, and on a created Topic id sends the app to `/topics/<id>`, leaves the panel open on the new-topic chat, and uploads the draft's files. The room's `topicToolCalls` event keeps its toast lines, since a room never creates.

### Time zero and the panel

The homepage registers a page context once the feed has loaded for a signed-in user: no Topic, no Team, and `isUserTopicFeedEmpty` from the "yours" and "subscribed" sections both being empty. An invited reader follows a Topic, so their feed is not empty and they get the pill like everyone else. Their homepage opens on "Your subscribed topics", since "Your topics" would be empty. `toDefaultChatId` opens the new-topic chat when the feed is empty, and for any signed-in user with no chat room and no page Topic or Team. The panel opens itself once per page load when the feed is empty, wide on a wide screen and over the page on a phone, the way the pill opens it, and a user who closes it is left alone until the next load. A sign-out reloads, so an account whose feed is still empty is welcomed again. The composer's placeholder reads "Let's make your first topic. You know the one." while `isFirstTopic` is true and "Let's make a topic. You know the one." after. The "start a topic" call to action stays for a visitor, who is sent to sign up.

The chat menu gains a "Give Carl a topic. You know the one." row for a signed-in user on every page, so the conversation is reachable from a Topic page or a Team page too. The private panel's header names it "Give Carl a topic. You know the one." as well.

### MCP

`create_topic` and `suggest_sources` register beside the other tools, account-only through the same connect-an-account result for a visitor. `create_topic` is annotated destructive, since it starts a Scan and spends; `suggest_sources` is read-only in effect and annotated so, with the open world hint since it reaches the web.

### Vocabulary

The conversation is the **new-topic chat** in code and specs. Copy calls it "New topic". The tools keep the Topic Tool name, now five.

## Risks / Trade-offs

- [The model narrates a save without calling the tool once its history holds earlier save narrations] → The new-topic chat is short, starts at time zero for most users, and lands on a new page on a real save. The toast and the navigation are the truth signal, and the honesty rule stays in the prompt. The general fix, replaying stored tool calls to the model, is its own change.
- [The daily suggestion limit is reached mid-wizard] → The tool says so, and Carl proposes from what he knows and the web search, naming each as unverified. `createTopic` still builds every Source through the registry, and the Scan's screening handles a url that does not read.
- [A user with many chat rooms lands on the homepage] → Nothing changes for them. The busiest room still wins, and "New topic" sits in the menu.
- [Two create paths drift] → There is one. The tool builds the editor's payload and calls the editor's function.

## Migration Plan

No schema change. The new prompt syncs to the registry with the others. Nothing to roll back beyond the code.

## Open Questions

- Whether a Topic made in chat should default to invite visibility like the editor's, or private. The editor's default is kept, so the two paths match.
- Whether the draft should survive a reload. It does not yet. Carl writes it again from the conversation, and a browser-stored draft is one line if that turns out to matter.
- Whether the homepage should reopen the panel on every page load while the feed is empty. It does, since there is nothing else on that page for them yet, and a close holds until the next load.
