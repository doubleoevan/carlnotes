---
title: Add to AI
description: >-
  Connect CarlNotes to Claude, ChatGPT, and coding AI Agents. Set up OAuth sign-in, understand all twenty-five MCP tools,
  and manage access to your topics and findings.
sidebar:
  order: 2
---

Carl answers your AI the way he answers you. Every page's header has an **Add to AI** option in its actions menu, the
**⋮** button beside the sort and filter icons. It opens a dialog that lists Claude, ChatGPT, Gemini, Grok, Perplexity,
DeepSeek, Cursor, VS Code, and Copy server URL, in that order. The app you picked last time moves to the top. Copy
server URL is always last.

![The Add to AI dialog, with the paste steps for Claude
open](../../../assets/screenshots/add-to-ai-dialog-claude.png)

## One server

Your AI connects to CarlNotes through an MCP server. MCP, the Model Context Protocol, is the standard way an AI app
connects to outside tools. Every app in the list connects to MCP servers over the web.

Every page offers the same server, `https://carlnotes.com/mcp`, so you add CarlNotes once. Your AI finds a topic by its
name, so ask about any topic you can read.

## Installing

Use `https://carlnotes.com/mcp` as the server URL. It uses streamable HTTP. You do not need an API key or a manually
created OAuth client ID. Your AI app discovers the sign-in service and registers itself.

### Claude

1. Open **Customize → Connectors** and choose **Add custom connector**.
2. Name it **CarlNotes** and enter `https://carlnotes.com/mcp`.
3. If Claude asks for an authentication choice, choose **Sign in now**. Leave optional OAuth client credentials blank.
4. Add the connector, choose **Connect**, and complete CarlNotes sign-in and consent in your browser.
5. In a conversation, enable CarlNotes under **+ → Connectors**. Try “Find public topics about coffee.”

On a managed workspace, an owner may need to add the connector before members can connect their accounts.
See [Claude's custom connector instructions](https://claude.com/docs/connectors/custom/add-unlisted) for your plan's controls.

### ChatGPT

1. Open **Plugins**, select the plus button, and choose **Add custom MCP server**.
2. Enter **CarlNotes** and the server URL `https://carlnotes.com/mcp`.
3. Choose **OAuth** authentication. Follow the browser sign-in and CarlNotes consent prompts when offered.
4. Review the notice, select **Create as a plugin**, and install the resulting plugin.
5. In a conversation, type **@** and choose CarlNotes. Try “List my CarlNotes topics.”

Your workspace can restrict custom MCP plugins or require administrator approval.
See [ChatGPT's custom MCP setup](https://developers.openai.com/api/docs/guides/custom-mcp-server) if these controls are unavailable.

### Claude Code

Run this command in your terminal:

```sh
claude mcp add --transport http carlnotes https://carlnotes.com/mcp
```

In Claude Code, run `/mcp`, choose CarlNotes, and complete authentication in the browser.
See [Claude Code's MCP guide](https://code.claude.com/docs/en/mcp) for configuration scopes and troubleshooting.

### Codex

Run these commands in your terminal:

```sh
codex mcp add carlnotes --url https://carlnotes.com/mcp
codex mcp login carlnotes
```

Complete CarlNotes sign-in and consent in the browser. Run `/mcp` in Codex to check that its tools are available.
See [Codex's MCP commands](https://learn.chatgpt.com/docs/developer-commands#codex-mcp) for configuration and authentication options.

### Other apps

Cursor and VS Code install with one click. The option is a link the editor opens, and the server appears in its MCP
list.

Gemini, Grok, and Perplexity take a pasted URL. Their option opens the steps for that app, the server URL, and a copy
button. Client support and workspace permissions determine which tools and sign-in options are available.

DeepSeek's chat app doesn't take connectors, so its steps are for DeepSeek Harness. DeepSeek Harness has no way to sign
in, so it reads as a visitor. Copy server URL works for any other app that lists MCP servers.

## What your AI can do

Without an account, your AI reads what a visitor reads. It finds public topics, podcast episodes, posts, findings,
teams, and profiles by name, the same search the site's search bar runs. It lists the public topics and reads a
topic's feed, with Carl's note on each finding. It also searches one topic's findings by meaning. That search uses a
shared public budget. When that budget is spent for the month, it says so, and reading the feed keeps working.

Connect an account to unlock the rest:

- **Read, rate, bookmark, follow.** Mark a finding read, rate it up or down, bookmark it, or follow a topic, the same
  as on the page.
- **Your topics.** Search and the topic list include the topics you own, follow, or have through a team. Each listed
  topic comes with its sources and their ids.
- **Edits.** Change a topic's name, tags, visibility, schedule, findings per brew, podcast, or prompt, and add or
  remove sources, in one edit. A prompt edit saves a version. Adding a source returns its projected cost. No brew
  starts. Making a topic public or removing a source saves nothing at first: your AI shows you the change and asks,
  and it saves only once you agree. See [Editing a topic with Coffee Talk](/docs/feed/editing-a-topic-in-chat/) for
  the same edits from the panel.
- **Updates.** Say "what's new" or "catch me up" and Carl picks your unread findings across the topics you
  follow, or on one topic, trimmed to 5, 15, or 30 minutes of reading. They stay in your feed, marked read.
- **Brews News.** Say "what happened this week" and your AI reads who mentioned you in a hot take, then what happened
  on your topics, your teams' topics, and the topics you follow, over the last week, day, or hour. It marks nothing
  read or seen.
- **Open Mic.** Your AI lists a topic's Open Mic posts and reads one, with its summary. It reads the hot takes on a
  post and leaves yours. It never writes or publishes a post. A public topic's posts read without an account.
- **Brew now.** Start a brew of a topic you own, watch it, and stop it. It takes one of your daily brews, and it
  records its podcast episode like any other brew. Your AI never charges an overage: past your daily limit, it sends you
  to CarlNotes.
- **Ask about a topic.** Your AI reads the closest findings and recent brew reports for your question and writes the
  reply itself. It uses your model budget for one search and saves no chat.
- **New topics.** Ask for verified source suggestions for a title and prompt, then create the topic. Fields you leave
  out take these defaults: weekly on Wednesday at 9:00 AM, shared by invite, and the top 10 findings. Its first brew
  starts.

Every tool that needs an account says so when there is none. It also says that reading and searching public topics work
without one.

## Tool reference

The server advertises the same twenty-five tools to visitors and connected accounts. Sign-in changes permission, not the
tool list. Public tools also read private or invite topics when your account has access.

| Tool | What it does | Account and effects |
| --- | --- | --- |
| `list_topics` | Lists readable topics with their source IDs. | Public topics without sign-in; adds your owned, followed, and team topics when connected. Read-only. |
| `read_topic_feed` | Reads a topic's findings in relevance order, with full explanations. | Public reads work without sign-in. A connected account also receives its read and bookmark state. Read-only. |
| `search_topic_findings` | Searches one readable topic's findings by meaning. | Uses the public search budget for a visitor, or the connected account's model budget. Read-only. |
| `search` | Searches topics, podcast episodes, posts, findings, teams, and profiles with filters and numbered pages. | Results respect your access. Account-only filters use your own read and bookmark state. Read-only. |
| `mark_finding_consumed` | Marks a readable finding read for you. | Requires an account. Saves your read state. Repeating it has the same effect. |
| `rate_finding` | Rates a finding up or down, or clears your rating. | Requires an account with rating permission, such as the owner, a team member, or an eligible follower. Repeating a rating has the same effect. |
| `send_finding_feedback` | Saves your own words about why a finding was good or bad. | Requires an account with rating permission. Your words are stored and never change scoring. Repeating it saves them again. |
| `bookmark_finding` | Saves or removes a bookmark. | Requires the topic owner or a member of a team holding the topic. Repeating the same choice has the same effect. |
| `follow_topic` | Follows or unfollows an accessible topic. | Requires an account. Owners cannot unfollow their own topics. Repeating a choice has the same effect. |
| `edit_topic` | Changes permitted topic fields and sources. | Requires edit permission. Prompt changes keep a version; source additions report projected cost. Public visibility and source removal need confirmation. No brew starts. |
| `suggest_sources` | Finds verified sources for a name and prompt. | Requires an account. Consumes its daily suggestion allowance and uses external search. It does not save sources to a topic. |
| `create_topic` | Previews a Topic Draft, then creates it after you confirm. | Requires an account and existing plan capacity. Only the confirmed call saves the Topic and starts its first brew. |
| `send_to_topic` | Saves a summary you explicitly ask an app to send, with up to ten public links. | Requires a live connected account and one to twenty Topics you can edit. Counts once toward the daily send allowance; never pastes a raw conversation. |
| `suggest_topics` | Lists every editable send destination with the strongest matches first, for the supplied title, summary, and links, with five editable Topics per page. | Requires an account. Stores nothing, spends no send or draft allowance, and uses the existing model budget for transient matching. Uses `list_topics` cursor paging. |
| `read_updates` | Picks your unread findings to read next, across the topics you follow or on one topic, with Carl's opener. Takes `minutes` of 5, 15, or 30, and 15 if you leave it out. | Requires an account. Marks the findings it picks read, so two lists share none. |
| `start_scan` | Starts a brew of a topic now. | Requires the topic's owner or an admin. Takes one of the account's daily brews, reports and records a podcast episode like any other brew, and never charges an overage. |
| `read_scan_status` | Reads a topic's running brew by stage, or its latest recap, with what each source found and the state of its podcast episode. | Public topics work without sign-in. Private and invite topics need access. Read-only. |
| `stop_scan` | Stops a topic's running brew. | Requires the topic's owner or an admin. What Carl kept stays, what the brew spent stays charged, and its daily brew comes back. |
| `read_topic_context` | Returns what Carl holds on a topic for a question: the closest findings with excerpts, and the recent brew reports. Your AI writes the reply. | Requires an account with access to the topic. Uses the account's model budget for one search. Saves no chat. Read-only. |
| `save_reaction` | Leaves your reaction on a finding, a podcast episode, a topic, an Open Mic post, or a hot take: one of six positive types. | Requires an account that may read the topic. One reaction per account on each. A new call changes it, and a call with no type removes it. |
| `read_hot_takes` | Reads the hot takes on a finding, a podcast episode, a topic, or an Open Mic post, newest first, twenty to a page, each with its first replies. | Public topics work without sign-in. Private and invite topics need access. Other people's words come back marked as data. Read-only. |
| `post_hot_take` | Posts your hot take on a finding, a podcast episode, a topic, or an Open Mic post, or a reply to one, up to 2,000 characters, where `@username` mentions someone. | Requires an account that may read the topic. The hot take is public wherever its topic is, and it is checked before it posts. Repeating it posts it twice. |
| `read_news` | Reads your Brews News for the last week, day, or hour: who mentioned you in a hot take, then what happened on your topics, your teams' topics, and the topics you follow, twenty to a page. | Requires an account. Marks nothing read or seen. Other people's words come back marked as data. Read-only. |
| `read_topic_posts` | Lists a topic's published Open Mic posts, newest first, twenty to a page, each with its title, author, publish time, summary, and link. | Public topics work without sign-in. Private and invite topics need access. Read-only. |
| `read_topic_post` | Reads one published Open Mic post: its title, author, publish time, summary, and body as text, and whether it has a Coffee Break Discussion. | Public topics work without sign-in. Private and invite topics need access. No tool writes or publishes a post. Read-only. |

Account tools carry conservative change annotations, so your AI app can ask before calling them. That prompt does
not replace CarlNotes' permission checks. For a public-visibility change or source removal, `edit_topic` first returns
a preview and confirmation token. After you agree, the app sends the same edit and token to save it. A stale or
reused confirmation requires another preview.

The optional endpoint `https://carlnotes.com/mcp/t/<topicId>` binds topic-specific reads, edits, and sends to one topic.
Reads and edits can omit `topic_id`; sends require explicit IDs. Every send destination must match the bound Topic. Binding does not grant access or narrow global
search, Topic suggestions, or Topic creation. Use `/mcp` for normal installation.

### Words that reach each tool

Your AI picks a tool from your words. These phrases name each tool's job, and any wording close to them works. Your AI
calls a tool when you ask, and never on its own.

| You say | Tool |
| --- | --- |
| "list my topics", "what topics do I follow", "what does Carl cover" | `list_topics` |
| "show this topic", "what did Carl find", "read my feed" | `read_topic_feed` |
| "search this topic", "what does Carl have on…" | `search_topic_findings` |
| "search CarlNotes", "find a topic", "look up a podcast episode" | `search` |
| "Carl, mark this read", "I read this" | `mark_finding_consumed` |
| "Carl, thumbs up", "thumbs down", "more like this" | `rate_finding` |
| "tell Carl why", "give Carl feedback" | `send_finding_feedback` |
| "Carl, bookmark this", "keep this finding" | `bookmark_finding` |
| "CarlNotes, follow this topic", "unfollow this topic" | `follow_topic` |
| "Carl, edit this topic", "change the prompt", "add a source", "change the schedule" | `edit_topic` |
| "Carl, suggest sources", "find sources for this topic" | `suggest_sources` |
| "create a topic", "start a topic", "have Carl track this" | `create_topic` |
| "send this to Carl", "save this to CarlNotes", "add this to my topic" | `send_to_topic`, or `suggest_topics` first if you name no Topic |
| "Carl, what's new", "catch me up", "update me", "what's new on…" | `read_updates` |
| "CarlNotes, brew this topic now", "run this topic now" | `start_scan` |
| "how is the brew going", "is Carl done", "show the latest brew" | `read_scan_status` |
| "Carl, stop the brew", "cancel this brew" | `stop_scan` |
| "ask Carl about this topic", "what does Carl know about…", "what's the latest on…" | `read_topic_context` |
| "Carl, react to this", "like this finding" | `save_reaction` |
| "what are people saying", "read the hot takes", "read the conversation" | `read_hot_takes` |
| "leave a hot take", "post a comment", "reply to the conversation" | `post_hot_take` |
| "Carl, give me the Brews News", "what happened this week", "who mentioned me" | `read_news` |
| "what's on this topic's Open Mic", "show this topic's posts" | `read_topic_posts` |
| "read that Open Mic post", "read this post to me" | `read_topic_post` |

### Send and suggestion arguments

To try it in a chat, follow [Send AI chats to CarlNotes](/docs/topics/send-ai-chats-to-carlnotes/).

`send_to_topic` takes `topic_ids` with one to twenty distinct editable Topic IDs, `title` (1–200 characters), `summary`
(1–2,000 Unicode characters), and up to ten distinct safe public `links`. An optional `chat_url` stays a private
reference and never joins the crawl queue. For one destination, the existing `topic_id` field remains supported; use
exactly one destination field. An optional `request_id` identifies retries of the same content and destination set. One
successful call counts once toward the shared daily send ceiling. AI Agent sends on every plan and emails on Plus and
Premium share a provisional ceiling of 200 accepted sends per UTC day, solely to stop runaway AI Agents. At the ceiling,
Carl says “The day's limit is reached.” Retry after midnight UTC; upgrading does not raise it. If any destination is
refused, nothing is saved or charged. With `topic_ids`, acceptance returns a `confirmations` list with each Topic ID,
name, URL, entry ID, and queued-link count, plus the accepted title. Legacy `topic_id` calls return one confirmation
directly. Refusals explain missing access, disconnection, quota/reset time, retry conflicts, or unavailable receiving;
they do not claim storage.

`suggest_topics` takes the same `title`, `summary`, and `links`, and accepts an optional `chat_url`. It carries that conversation link through to your chosen send. Ranking uses the content you submitted. An optional `query` filters editable names and `cursor` requests another page. It returns `editableTopics`, `nextCursor`, and the number of pages when known. The legacy `publicTopicsToFollow` field is empty; the send picker does not offer public discovery. Each match
has an ID, name, prompt preview, URL, group, relevance score, and best-match flag. Every Topic you can edit appears, ranked by relevance; strong matches are checked by default and weaker ones remain unchecked. Search filters that editable list by name while preserving your choices. Name autocomplete uses `autocomplete=true` for a name-only read without AI matching.
Every page adds `newPrivateTopic`, an offer with instructions rather than a saved or generated draft. A missing
model key or provider failure returns unavailable. Neither tool can read an assistant's chat history, memory, uploaded
files, or mailbox history; Carl receives only explicit arguments. To email Carl directly for your Topics, use the
[Email Carl guide](/docs/topics/email-carl/).

### Choosing where to send

Ask your app to send a concise synthesis: what you are working on or asking about, what you concluded, open questions,
and the links that mattered. It must never paste the raw conversation. `send_to_topic` always takes explicit Topic IDs and stores one entry per destination when accepted. Your text, summary, and private annotations stay visible only to you. The destination Topic uses your text and links for scoring; its public explanations use linked-page evidence alone. Podcasts narrate only the public explanation.

If you ask to send, share, save, add, or forward something to Carl, CarlNotes, or your Topics without naming a Topic, the app first calls `suggest_topics` and waits for your choice. It must never
call this tool on its own initiative. Carl compares the supplied content with Topic names, prompts, and context. Suggestions list every Topic you can edit, including public, private, invite, and Team Topics. Strong matches appear first and checked; weaker editable Topics remain available unchecked. There is no public-follow group in the send picker. Repeat the same title, summary, links, and active query with `nextCursor` to page further.

Every page and search offers **Start a new topic for this chat**. Nothing is drafted until you pick it. Source suggestions use
the existing daily allowance, and the draft uses the normal Topic Draft fields and limits. Review the private draft
before confirming creation. Creation uses the normal plan limits;
confirming **Create this Topic** also saves this chat into the new Topic. Other checked Topics are not included. If the send fails, retry Send with the created Topic selected; this does not create another Topic. A Topic-bound connection must switch to `/mcp` to send
to another Topic. Matching stores no input or vectors; an unavailable model key or provider returns an error instead
of arbitrary choices.

## CarlNotes inside your AI app

Claude, ChatGPT, VS Code, and Goose can show CarlNotes controls right in your chat. Findings and search results open as
tables you can page through, and you can sort search results. Open a finding's row for Carl's note and your own private
annotation, and to rate it, tell Carl why, bookmark it, or mark it read. Search, play podcasts, follow Topics, and edit
a Topic with the same fields you use in Coffee Talk, then choose Save to confirm. Everything uses your connected
account. If your AI app blocks audio, use the link to listen on CarlNotes.

**Updates** shows Carl's opener and your findings in order, each with its reading time. Choose a Topic to see its
findings. **A brew** shows what it has kept so far and what each source found, with a stop control if you own the
Topic. Once it finishes, you get the same recap as the Topic page, and you can play its podcast episode. Your AI app's
colors apply where it shares them, and a row or a recap opens one step in the chat. Anything further opens on CarlNotes.

**Brews News** shows your mentions first, then the news, with the same Week, Day, and Hour choice as the card on your
home page. **Open Mic** shows a topic's posts as cards. Choose a card to open its post with its image, its Coffee Break
Discussion to play, and its hot takes, where you can read the conversation and leave your own. Writing and publishing
a post stay on CarlNotes.

The Topic picker asks **Where should this go?** It shows five editable Topics per page with best matches checked. Search offers matching Topic names as you type. Choose a suggestion to add it, or press Enter/Search to filter the list. **Topics to share this chat with** shows every checked destination as a removable tag pill. Checking or unchecking a box updates the pills immediately, and removing a pill unchecks its Topic across pages.

Choose **Send this chat to N topics** to save the summary in all selected Topics with one daily send charge. **Start a new topic for this chat** stays available on every page and search. Edit the proposed settings, then choose **Create this Topic** to create it and save the chat there. Your search, selections, and actions stay visible while results load. The coffee mug and CarlNotes name open the connected site in a new tab. A Topic-bound connection enables only its bound destination.

If your AI app cannot show these controls, CarlNotes still returns readable results. The Topic picker offers the same choices as a numbered list, including the option to start a new Topic.

![CarlNotes search for "freckle" in a Claude chat: numbered rows for a topic, two podcast episodes, and findings with
their play pills, the page buttons, and See all on CarlNotes](../../../assets/screenshots/mcp-host-search-view.png)

## Connecting an account

Your AI asks to connect through its own connect button. CarlNotes signs you in, then asks "Share CarlNotes with
Claude?", with your AI's name in place of Claude. **Allow** gives your AI your topics and lets it ask Carl questions. It
reads what you can read, rates what you can rate, and changes only what you can change yourself. **Not now** sends it
back with nothing.

CarlNotes uses OAuth with PKCE and an explicit consent page. The AI app keeps access and refresh tokens; it does not
receive your CarlNotes password. A client that cannot complete OAuth stays a visitor. An invalid or expired bearer
token grants no account access.

### Connected apps and disconnecting

Open **Account → Connected AI apps** to see current connections and disconnected Source history. Labels come from
validated registration domains, not an app's self-chosen name. Several registrations for one recognized app appear
together. A domain label identifies a registration; it is not a certification from that vendor.

Choose **Disconnect** and confirm to revoke your grants for that app group. New sends stop immediately, and those
refresh grants cannot issue more access tokens. Other accounts' grants remain unchanged. Existing read tokens can
work until expiry. A disconnected app shows **Reconnect**, which opens Add to AI at that app's steps. You finish in the
app itself. Reconnecting creates a new consent and can show a new, dismissible Topic setup notice.

Remove the connection in your AI app. For Codex, `codex mcp logout carlnotes` removes stored credentials and
`codex mcp remove carlnotes` removes the server entry. Other clients have their own disconnect or remove controls.

Removing local credentials does not guarantee server-side revocation. An OAuth client can revoke its refresh token
through CarlNotes' discovered revocation endpoint. That token then cannot issue more access tokens. Already-issued
access tokens can remain usable until expiry, including after signing out of CarlNotes. Contact
[support@carlnotes.com](mailto:support@carlnotes.com) for help with revocation.

Disconnecting does not delete saved Personal sources items. They stay encrypted until you delete an entry, its receiving
Source, the Topic, or your account. See [Personal sources](/docs/topics/personal-sources/).

### Send-only API keys

Premium accounts can create up to ten active keys in **Account → AI Agent API keys**. Give each key a label, copy it once,
and keep it in your coding AI Agent's secret storage. Closing the one-time display hides the secret permanently. Revoke
a lost key and create a replacement. The list shows its last four characters and last-used date.

These keys start with `cnk_v1_` and authorize only `POST https://carlnotes.com/api/personal-sources/sends`. They do not sign a
client into MCP or allow it to read your account. OAuth remains the authentication method for MCP.

```sh
curl https://carlnotes.com/api/personal-sources/sends \
  -H 'Authorization: Bearer YOUR_SEND_ONLY_KEY' \
  -H 'Content-Type: application/json' \
  --data '{"topic_id":"YOUR_PRIVATE_TOPIC_ID","title":"Research priorities","summary":"Focus on local model latency and energy use.","links":[],"request_id":"YOUR_UNIQUE_REQUEST_ID"}'
```

Keep a request ID stable when retrying the same send. Changing its content or destination produces a conflict.
Replaying a deleted send cannot restore it. Revocation and loss of Premium immediately stop key sends. Revoking deletes
the key, and what it already sent stays under the name "API key". You can still list and revoke keys after downgrading.

The [privacy policy's MCP section](/privacy#connections-to-ai-apps-mcp) explains arguments, results, tokens, analytics,
and retention. CarlNotes cannot read your assistant's chat history, memory, or uploaded files through MCP. It receives
only what the app supplies in its requests. Disconnecting does not erase results the app has already received.

## Limits

One tool caller can make 30 requests a minute. A tool caller is your AI or the Coffee Talk panel. Past that, CarlNotes
rejects requests until the minute is up. What your AI reads and changes counts against your plan the same way the pages
do. See [Plans and limits](/docs/account/plans-and-limits/).

Feed, topic-list, and topic-finding search results use cursors. Ask for the next page using `nextCursor` until it is
null. A page holds at most 20 items within a 40,000-character item budget. One oversized item is returned whole on its
own page, so this is not a universal response-size limit. Explanations are never cut to fit.

The site-wide `search` tool uses numbered pages with sizes 5, 10, 25, or 50. It considers at most 50 matches of each kind.
Topic-finding search ranks at most 40 findings per query. Semantic search needs an embedding budget; reading the
stored feed does not. Source suggestions also count against the account's daily allowance.

Setup instructions were checked against the linked client documentation on November 2, 2026. Directory submissions
and approval are separate from connecting by URL.

### Conversation backlinks and retention

When your app can supply the current conversation URL, it can include optional `chat_url` with `suggest_topics` or `send_to_topic`. The picker preserves it into the send. The URL is an encrypted, sender-only reference; it never enters Topic matching or the page queue. The date, platform name, and platform icon form one Nightshift link with a launch icon. Web links open in a new tab; mobile uses its browser. A verified `codex://threads/<thread-id>` reference opens the installed Codex app and requires that local chat to be available on the device. If the host supplies no URL, the label stays plain. CarlNotes never fabricates a URL or automatically creates a shared conversation snapshot.

AI sends, email items, and imported conversations remain encrypted until you delete them. Carl decrypts bounded relevant text for private processing. The app’s sender-only access checks keep other accounts from reading your items, including Topic owners and administrators. See the [privacy policy](/privacy#personal-sources-data) for provider processing and deletion details.


Supported conversation destinations were checked on November 4, 2026. These are references supplied by your app or you;
connecting MCP does not guarantee that your app exposes its current conversation URL.

| Platform | Conversation reference |
| --- | --- |
| [Codex](https://learn.chatgpt.com/docs/reference/commands#deep-links) | An existing local chat: `codex://threads/<verified-thread-id>`. CarlNotes accepts only this existing-chat action. |
| [ChatGPT](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt) | An available ChatGPT conversation URL or an existing shared link. Legacy `chat.openai.com` links retain the ChatGPT mark. |
| [Claude](https://support.claude.com/en/articles/10593882-share-and-unshare-chats) | An available Claude chat URL or an existing shared snapshot. Ordinary Claude uses the Claude mark. |
| [Claude Code](https://code.claude.com/docs/en/claude-code-on-the-web) | An existing `claude.ai/code/…` session URL. A terminal-only session without a web URL has no backlink. |
| [Gemini](https://support.google.com/gemini/answer/13743730) | An available `gemini.google.com` chat URL or an existing `g.co/gemini/share/…` link. |
| [Grok](https://x.ai/legal/faq) | A supplied `grok.com` conversation or shared link; `x.com/i/grok/…` is also recognized. |
| [Perplexity](https://www.perplexity.ai/en-GB/changelog/what-we-shipped-may-2nd) | A supplied conversation URL on `perplexity.ai`. CarlNotes does not discover or create its URL. |
| [DeepSeek](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html) | A supplied `chat.deepseek.com` conversation URL or an existing shared link. |
| [Cursor](https://prod.cursor.com/help/ai-features/shared-transcripts) | An available `cursor.com/agents/…` session or existing `cursor.com/s/…` shared transcript. |
| [Copilot](https://support.microsoft.com/en-us/microsoft-365-copilot/share-conversations-responses-in-microsoft-copilot) | A supplied `copilot.microsoft.com` conversation. Microsoft 365 `m365.cloud.microsoft/chat/…` references use the same platform mark. |

A shared snapshot can expose the conversation to people who hold its link, depending on the platform's access rules.
CarlNotes preserves a link you already supplied; it never publishes a chat to obtain one. Deleting or restricting the
original conversation may stop the backlink from opening. Other valid web references use a generic chat icon.
