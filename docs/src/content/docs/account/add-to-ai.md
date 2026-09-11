---
title: Add to AI
description: >-
  Carl takes questions from Claude, ChatGPT, Gemini, Grok, Perplexity, DeepSeek, Cursor, or VS Code. Where the
  Add to AI option lives,
  what your AI can read without an account, and what connecting one adds.
sidebar:
  order: 2
---

Carl answers your AI the way he answers you. Every page's header has an **Add to AI** option in its
actions menu, the **⋮** button beside the sort and filter icons. It opens a dialog listing Claude,
ChatGPT, Gemini, Grok, Perplexity, DeepSeek, Cursor, VS Code, and Copy server URL, in that order. The one you picked last time leads the
next time, and Copy server URL is always last.

![The Add to AI dialog, with the paste steps for Claude
open](../../../assets/screenshots/add-to-ai-dialog.png)

## Two servers

An app page offers the account server at `https://carlnotes.com/mcp`. A topic page offers that
topic's own server at `https://carlnotes.com/mcp/t/<topic id>`, which has the same tools with the
topic already filled in: a call that names no topic gets this one, and a call that names another is
rejected. Share a topic-bound link with someone whose AI should read one topic and nothing else.

Both speak the Model Context Protocol over HTTP, which is what the four listed apps read.

## Installing

Cursor and VS Code install with one click: the option is a link the editor opens, and the server
appears in its MCP list. Claude, ChatGPT, Gemini, Grok, and Perplexity take a pasted URL: the option
opens the steps for that app, the server URL, and a copy button. Claude Code takes the command shown under the steps, in a
box with its own copy button. DeepSeek's chat app takes no connectors, so its steps are for DeepSeek
Harness, which reads as a visitor since it has no sign-in flow. Copy server URL covers any other app
that lists MCP servers.

## What your AI can do

Without an account, your AI reads what a visitor reads. It lists the public topics, reads a topic's
feed with Carl's note on each finding, and searches a topic's findings by meaning. Search runs on a
shared public budget, and when that budget is spent for the month, search says so and the feed read
keeps working.

Connect an account and the rest opens up:

- **Read, rate, bookmark.** Mark a finding read, rate it up or down, or bookmark it, the same as on the page.
- **Your topics.** The list includes the topics you own, follow, or hold through a team, each with
  its sources and their ids.
- **Edits.** Rewrite a topic's prompt, add a source, or remove one. A prompt edit keeps a version,
  adding a source returns what it is projected to cost, and no brew starts. See
  [Editing a topic with Coffee Talk](/docs/feed/editing-a-topic-in-chat/) for the same three changes
  from the panel.
- **New topics.** Ask for verified source suggestions for a title and prompt, then create the
  topic. It takes the editor's defaults, weekly on Wednesday, shared by invite, the top ten
  findings, and its first brew starts.

Every tool that needs an account says so when there is none, and that reading and searching public topics work without one.

## Connecting an account

Your AI asks to connect through its own connect control. CarlNotes signs you in, then asks "Let Claude read as you?", with your AI's own name in place of
Claude. **Allow** hands it your topics and takes its questions. It reads what you can
read, rates what you can rate, and changes only what you could change yourself. **Not now** sends it
back with nothing.

## Limits

One tool caller may make thirty requests a minute, whether that is your AI or the Coffee Talk
panel. Past that, requests are rejected until the minute turns. What your AI reads and changes
counts against your plan the same way the pages do. See [Plans and limits](/docs/account/plans-and-limits/).
