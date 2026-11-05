# Proposal

## Why

CarlNotes cannot receive the research context a person chooses to send from an AI app or forward by email. Personal sources will turn that context into better scoring and queue outside-world links for the next Scan.

This proposal follows the [CarlNotes workflow](https://app.notion.com/p/40462400378d8120bddcfd51302e49b7), read on November 2, 2026. Implementation was authorized on November 2, 2026. The latest mockups, sender-only privacy decision, and November 3 final additions define the controls described below.

## What Changes

- Add `ai_agent` and `email` Source kinds on any Topic the sender can edit. Use **Personal Source Entry**, `PersonalSourceEntry`, and `personal_source_entries` for one received record.
- Store sends, emails, and selected chat imports in one encrypted store for Personal sources. All items remain encrypted until explicitly deleted.
- Add `send_to_topic` on both MCP routes and an equivalent API-key endpoint. Every send requires one to twenty explicit editable Topics, stores atomically in all destinations, and consumes one daily allowance. A separate read-only `suggest_topics` tool lists every editable send destination, strongest matches first and checked, in five-row pages with name autocomplete/filtering and live selected-topic tag pills, without public discovery or storage, and offers the existing confirmed Topic Draft flow only after selection.
- When the user explicitly asks to send, share, save, add, or forward something to Carl, CarlNotes, or their topics without naming a Topic, call `suggest_topics`, then wait for their choice before sending. A named Topic goes directly to `send_to_topic` after resolving its ID; an ambiguous name needs clarification, not an inferred destination. Never initiate either tool without the user’s request.
- Derive connected AI Agents from OAuth grants and live refresh tokens. Use registered domains for identity, group registrations by app, and provide account revocation.
- Accept manual email and forwards at the environment’s digest sender address on Plus and Premium. Authenticate the sender with Resend’s aligned DKIM and DMARC results. Save every clear editable match together and reply with numbered Topic links. When Carl needs help, the reader can reply with numbers, existing Topic names, or both.
- Ignore other mailboxes, automated responses and acknowledgments. Guide authenticated unregistered senders to sign in, and Free senders to the plans page. Carl replies to the verified From in the same thread. Only a successful filing uses the shared daily allowance.
- Add web imports from ChatGPT and Claude exports or pasted transcripts, plus native address copying. Personal sources have their own sender-only group after Sources and never consume `MAX_TOPIC_SOURCES`; a first send still succeeds at ten fetched Sources.
- Use **Personal sources** throughout product copy, including AI Agent controls and the section shared by Topic info and Artisanal Blend.
- In Topic info and Artisanal Blend, put the current sender's Personal sources after fetched Sources, with one collapsed **Personal sources · N items** header in the existing muted Architects Daughter section-label style, and **Only you can see this** on the right. Expand it for the whole section: numbered item rows with no internal scoring summary or coverage helper text. Reuse the compact Steeping loading state. Each nested item expands independently, with equal compact top and bottom content padding. Show at most five items per page using the existing numbered square pagination. Closing the section hides everything inside and releases private query state. Use compact vertical spacing and underline the row label on hover/focus or native press instead of filling the row. Keep no extra horizontal padding or Source-group disclosure, and no divider after the last item, while retaining its bottom padding.
- Use the existing Topic info popup and Artisanal Blend card, with no separate Personal sources button or popover. Hide the section and added dividers when the sender has no items, preserving the existing Topic layout. Receiving setup stays in the Topic editor; returning senders with Topic read access see only their own retained history. Use the existing dotted/dashed divider above the section in the popup and below it in Artisanal Blend. Item titles use regular-weight muted Architects Daughter text. Each item expands to full text, sender/date, link outcomes and Finding links, and confirmed Delete, with paging.
- Reuse `TopicPersonalSourcesSection` and its full item list from `packages/core/components` in both placements on web and mobile. Keep the shared `ExpandableRow` Nightshift contract, matching platform adapters, and paired stories. Empty content explains an explicit Claude summary send and provides one environment-address hint with Copy. Report preflight and component parity counts.
- Show editable Topics in a picker with prechecked best matches, searchable names, five per page, and one send for the checked destinations. Creating a private Topic from a confirmed draft also saves this chat there. Hosts with text-only results show the same destinations as a numbered list.
- Describe a good `send_to_topic` payload as the user's work or question, conclusions, open questions, and meaningful links. Never send the raw conversation.
- Document how to send an AI chat or email to Carl, what Carl receives, how to choose Topics, and how to find or delete the saved items. Keep the existing connection guide URL.
- Summarize each sender’s live entries separately for each Topic through a debounced Temporal workflow. Bill each attempt to that Topic’s owner, as with Scans, while keeping the resulting summary sender-only. Reuse bounded context during scoring without charging for summarization again. Personal sources ingesters return queued public links without copying private text into global Resources.
- Use one daily send allowance across AI Agent sends and accepted forwarded emails: 200 for Free, Plus, and Premium, resetting at UTC midnight. Email forwarding requires Plus or Premium; Free retains AI Agent sends only. Each accepted delivery counts once across all destination Topics. Imports and unfiled mail do not consume the allowance.
- Keep the ten-fetched-Source limit, excluding receiving Sources, and preserve frozen mobile contracts, MCP origin/auth/result-size checks, Nightshift contracts, and existing fetched Sources.
- Update vocabulary, connection docs, privacy disclosures, prompts, and cross-platform regression coverage. No production setup, directory submission, or publication occurs during planning.

- Keep each sender’s items, summary, counts, and Finding annotations private to that sender, including from the Topic owner. Sent text and links affect only the destination Topic’s scoring, for every visibility and editable Team Topic.
- Write a public page-grounded explanation and separate sender-private annotations in one structured scoring call per sender. Public text never quotes or attributes sent material. Podcasts, feeds, shared chats, cards, notifications, and scan reports receive only the public explanation.
- Preserve normal visibility, Team, ownership, invitation, and podcast controls. Convert legacy development explanations before exposing them; changing visibility never exposes Personal sources text or annotations.

The Topic picker uses the standard search-result row, checkbox, Best match pill, and numbered pagination. Selected Topic pills update across searches and pages. The reader can send to those Topics or start a Topic Draft at any time.

Personal sources links receive a durable 0.10 score bonus, halved for newsletter or automatic provenance, replacing the custom Source bonus when both apply. Queued links are reviewed first and bypass the embedding relevance pre-filter while retaining scoring, explanations, safety, and final trimming.

## Capabilities

### New Capabilities

- `personal-sources`: private Source lifecycle, encrypted Personal Source Entries, retention, deletion, web/mobile presentation, and documentation.
- `AI Agent-sends`: connected-AI Agent identity, topic routing, send validation, API credentials, and account controls.
- `chat-imports`: explicit conversation selection and transcript import without an OAuth connection.
- `email-forwarding`: one environment-configured shared address, authenticated senders with account-gated filing, editable Topic routing, signed inbound delivery, and filing replies.
- `personal-source-summaries`: durable context rebuilding, deletion invalidation, Topic-owner billing, and bounded sender-private scoring context.

### Modified Capabilities

- `source-ingestion`: queued-link ingesters and an explicit exception that keeps Personal sources text out of Resource snippets.
- `mcp-server`: thirteen-tool inventory, additive-send annotations, verified client identity, and current revocation disclosures.
- `mcp-views`: seven MCP-view-backed tools and four resources, including the suggestion picker and multi-Topic receipts.
- `topic-editing`: connected-AI Agent picker actions and safe reconciliation of asynchronously created Sources.
- `topic-publishing`: visibility changes with private data isolation and public-only narration.
- `authorization`: Personal sources capabilities and quotas, with sender-only private content rules distinct from administrative moderation.

## Impact

Contracts, database schema and generated migrations, the API and OAuth caller resolution, shared clients/components, web and mobile Topic controls, account controls, the pipeline, Temporal workflows, MCP views, docs, and privacy copy change together. Resend receiving needs an operator-configured subdomain, MX record, API credential, and webhook secret before rollout.

The design resolves current conflicts: eleven versus thirteen MCP tools, five versus seven MCP view tools, globally stored snippets, late publication of private explanations, and editor saves that delete Sources absent from stale forms. No new AI Agent-connection table or second received-content store is introduced.

Work integrations, Gmail OAuth, historical mailbox reads, public repository feeds, report delivery, and enterprise plans remain outside this change. The unrelated active `split-web-from-api` proposal remains untouched.

The component-browser acceptance includes paired web/mobile stories for the shared section and both placements: empty, with items collapsed, and with an item expanded, plus loading/error/long-text states and the contracted shared expandable row.


One send or email creates one independent item per destination Topic and consumes one allowance from the same sender pool as AI Agent sends and forwarded emails for the complete delivery. Each Topic separately summarizes its sender context and pays its own model cost. Deleting an item in one Topic leaves the other destinations intact.

PlanCards show “Send AI chats to Carl to read for your topics” with a checkmark on every plan, and “Send emails to Carl to read for your topics” on Plus and Premium. Add both through the existing shared core PlanCard. Keep the common 200-per-day runaway-AI Agent ceiling off the cards; reaching it says plainly that the day’s limit is reached.

### Source-link presentation

Use the stored linked-page title when available, otherwise the full original URL. Truncate long labels visually while preserving their complete accessible names and destinations. Read existing Resource titles with link outcomes; opening the item performs no page fetch.

Source links with an authorized Finding open the existing Finding detail popup on web or sheet on mobile in place, preserving the parent section, page, expansion, scroll, and route. The tooltip and native accessibility hint say **A topic finding note from Carl**. Other source links open externally with the Lucide ExternalLink icon; only pending links also show **Next brew**. Reviewed or rejected links show no status label, and there is no separate **Became a finding** link. An unavailable Finding falls back to its external source page.

The Topic editor has no email forwarding setup. Only empty Personal sources content shows a short configured-address hint with Copy; forwarding instructions remain in the docs.


## Email clarification and editable Topic Drafts

A clarification keeps only sender-bound delivery references and up to five ordered Topic IDs. Resend holds the original email until a reply identifies where to file it. Carl stores each accepted item encrypted under its sender and Topic. A provider retry or duplicate selection cannot save or charge twice.

The AI picker opens an editable private Topic Draft with the chat’s links as candidate Sources. When the reader confirms the fields, create the Topic and save that chat to it. A retry after creation reuses the same new Topic. Premium send-only API credentials remain hashed and are shown once.
