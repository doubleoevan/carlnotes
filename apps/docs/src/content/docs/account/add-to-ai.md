---
title: Add to AI
description: >-
  Connect CarlNotes to Claude, ChatGPT, and coding agents. Set up OAuth sign-in, understand all eleven MCP tools,
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

Without an account, your AI reads what a visitor reads. It finds public topics, podcast episodes, findings, teams, and
profiles by name, the same search the site's search bar runs. It lists the public topics and reads a topic's feed, with
Carl's note on each finding. It also searches one topic's findings by meaning. That search uses a shared public budget.
When that budget is spent for the month, it says so, and reading the feed keeps working.

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
- **New topics.** Ask for verified source suggestions for a title and prompt, then create the topic. Fields you leave
  out take these defaults: weekly on Wednesday at 9:00 AM, shared by invite, and the top 10 findings. Its first brew
  starts.

Every tool that needs an account says so when there is none. It also says that reading and searching public topics work
without one.

## Tool reference

The server advertises the same eleven tools to visitors and connected accounts. Sign-in changes permission, not the
tool list. Public tools also read private or invite topics when your account has access.

| Tool | What it does | Account and effects |
| --- | --- | --- |
| `list_topics` | Lists readable topics with their source IDs. | Public topics without sign-in; adds your owned, followed, and team topics when connected. Read-only. |
| `read_topic_feed` | Reads a topic's findings in relevance order, with full explanations. | Public reads work without sign-in. A connected account also receives its read and bookmark state. Read-only. |
| `search_topic_findings` | Searches one readable topic's findings by meaning. | Uses the public search budget for a visitor, or the connected account's model budget. Read-only. |
| `search` | Searches topics, podcast episodes, findings, teams, and profiles with filters and numbered pages. | Results respect your access. Account-only filters use your own read and bookmark state. Read-only. |
| `mark_finding_consumed` | Marks a readable finding read for you. | Requires an account. Saves your read state. Repeating it has the same effect. |
| `rate_finding` | Rates a finding up or down, or clears your rating. | Requires an account with rating permission, such as the owner, a team member, or an eligible follower. Repeating a rating has the same effect. |
| `bookmark_finding` | Saves or removes a bookmark. | Requires the topic owner or a member of a team holding the topic. Repeating the same choice has the same effect. |
| `follow_topic` | Follows or unfollows an accessible topic. | Requires an account. Owners cannot unfollow their own topics. Repeating a choice has the same effect. |
| `edit_topic` | Changes permitted topic fields and sources. | Requires edit permission. Prompt changes keep a version; source additions report projected cost. Public visibility and source removal need confirmation. No brew starts. |
| `suggest_sources` | Finds verified sources for a name and prompt. | Requires an account. Consumes its daily suggestion allowance and uses external search. It does not save sources to a topic. |
| `create_topic` | Creates a topic from a draft, optionally with sources, invitations, and a team you lead. | Requires an account and available plan capacity. Saves the topic and starts its first brew. |

Account tools carry conservative change annotations, so your AI app can ask before calling them. That prompt does
not replace CarlNotes' permission checks. For a public-visibility change or source removal, `edit_topic` first returns
a preview and confirmation token. After you agree, the app sends the same edit and token to save it. A stale or
reused confirmation requires another preview.

The optional endpoint `https://carlnotes.com/mcp/t/<topicId>` binds topic-specific reads and edits to one topic.
Those calls can omit `topic_id`; naming another topic is rejected. Binding does not grant access or narrow global
search and topic creation. Use `/mcp` for normal installation.

## Cards

Claude, ChatGPT, VS Code, and Goose show some results as cards instead of text. A search shows the search page's
numbered list, which you can page and sort, with play buttons, Follow, and each finding's note. A topic edit shows the
topic card from Coffee Talk. A change that needs your agreement gets a Save button that names what it changes. A feed
read shows the findings with Carl's notes, thumbs, bookmark, and done. A card's buttons do what your AI's own calls do,
under the same account. If an app blocks a card's audio, the card links to the episode's page instead.

The three cards are search, topic, and findings. Clients without MCP Apps support receive text and, where provided,
structured results. A card is optional; the tools remain usable without it.

![The search card for "freckle" in a Claude chat: numbered rows for a topic, two podcast episodes, and findings with
their play pills, the page buttons, and See all on CarlNotes](../../../assets/screenshots/mcp-host-search-card.png)

## Connecting an account

Your AI asks to connect through its own connect button. CarlNotes signs you in, then asks "Share CarlNotes with
Claude?", with your AI's name in place of Claude. **Allow** gives your AI your topics and lets it ask Carl questions. It
reads what you can read, rates what you can rate, and changes only what you can change yourself. **Not now** sends it
back with nothing.

CarlNotes uses OAuth with PKCE and an explicit consent page. The AI app keeps access and refresh tokens; it does not
receive your CarlNotes password. A client that cannot complete OAuth stays a visitor. An invalid or expired bearer
token grants no account access.

### Disconnecting

Remove the connection in your AI app. For Codex, `codex mcp logout carlnotes` removes stored credentials and
`codex mcp remove carlnotes` removes the server entry. Other clients have their own disconnect or remove controls.

Removing local credentials does not guarantee server-side revocation. An OAuth client can revoke its refresh token
through CarlNotes' discovered revocation endpoint. That token then cannot issue more access tokens. Already-issued
access tokens can remain usable until expiry, including after signing out of CarlNotes. Contact
[support@carlnotes.com](mailto:support@carlnotes.com) for help with revocation.

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
