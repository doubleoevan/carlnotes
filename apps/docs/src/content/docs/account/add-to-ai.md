---
title: Add to AI
description: >-
  Carl takes questions from Claude, ChatGPT, Gemini, Grok, Perplexity, DeepSeek, Cursor, or VS Code. Where the
  Add to AI option lives,
  what your AI can read without an account, and what connecting one adds.
sidebar:
  order: 2
---

Carl answers your AI the way he answers you. Every page's header has an **Add to AI** option in its actions menu, the
**⋮** button beside the sort and filter icons. It opens a dialog that lists Claude, ChatGPT, Gemini, Grok, Perplexity,
DeepSeek, Cursor, VS Code, and Copy server URL, in that order. The app you picked last time moves to the top. Copy
server URL is always last.

![The Add to AI dialog, with the paste steps for Claude
open](../../../assets/screenshots/add-to-ai-dialog.png)

## Two servers

Your AI connects to CarlNotes through an MCP server. MCP, the Model Context Protocol, is the standard way an AI app
connects to outside tools. Every app in the list connects to MCP servers over the web.

An app page offers the account server at `https://carlnotes.com/mcp`. A topic page offers that topic's own server at
`https://carlnotes.com/mcp/t/<topic id>`. The topic server has the same tools, with the topic already filled in. A call
that names no topic gets this topic. A call that names another topic is rejected. Share a topic server link with someone
whose AI should read one topic and nothing else.

## Installing

Cursor and VS Code install with one click. The option is a link the editor opens, and the server appears in its MCP
list.

Claude, ChatGPT, Gemini, Grok, and Perplexity take a pasted URL. Their option opens the steps for that app, the server
URL, and a copy button. For Claude Code, copy the command shown under the steps, from its box with its own copy button.

DeepSeek's chat app doesn't take connectors, so its steps are for DeepSeek Harness. DeepSeek Harness has no way to sign
in, so it reads as a visitor. Copy server URL works for any other app that lists MCP servers.

## What your AI can do

Without an account, your AI reads what a visitor reads. It lists the public topics and reads a topic's feed, with Carl's
note on each finding. It also searches a topic's findings by meaning. Search uses a shared public budget. When that
budget is spent for the month, search says so, and reading the feed keeps working.

Connect an account to unlock the rest:

- **Read, rate, bookmark.** Mark a finding read, rate it up or down, or bookmark it, the same as on the page.
- **Your topics.** The list includes the topics you own, follow, or have through a team. Each one comes with its
  sources and their ids.
- **Edits.** Rewrite a topic's prompt, add a source, or remove one. A prompt edit saves a version. Adding a source
  returns its projected cost. No brew starts. See
  [Editing a topic with Coffee Talk](/docs/feed/editing-a-topic-in-chat/) for the same three changes from the panel.
- **New topics.** Ask for verified source suggestions for a title and prompt, then create the topic. Fields you leave
  out take these defaults: weekly on Wednesday at 9:00 AM, shared by invite, and the top 10 findings. Its first brew
  starts.

Every tool that needs an account says so when there is none. It also says that reading and searching public topics work
without one.

## Connecting an account

Your AI asks to connect through its own connect button. CarlNotes signs you in, then asks "Share CarlNotes with
Claude?", with your AI's name in place of Claude. **Allow** gives your AI your topics and lets it ask Carl questions. It
reads what you can read, rates what you can rate, and changes only what you can change yourself. **Not now** sends it
back with nothing.

## Limits

One tool caller can make 30 requests a minute. A tool caller is your AI or the Coffee Talk panel. Past that, CarlNotes
rejects requests until the minute is up. What your AI reads and changes counts against your plan the same way the pages
do. See [Plans and limits](/docs/account/plans-and-limits/).
