---
name: domain-model
description: Canonical CarlNotes domain vocabulary. Use whenever naming types, tables, routes, variables, files, or writing specs and docs that touch domain concepts.
---

# CarlNotes domain model

> A **Topic** (owner = creator) is tuned with context and **Sources**; each **Scan** discovers **Resources** and appends **Findings** to the topic's **Feed**; users and **Audiences** hold **Subscriptions**, and **Integrations** connect Sources in and deliveries out.

| Entity | Is | Notes |
|---|---|---|
| Topic | the configuration | name, context doc, attachments (file in R2 + distilled context, processed once at upload), frequency, visibility (public / invite / private), owner_id |
| Source | topic input: "pull from X" | kind: rss, reddit, youtube, search, composio, plugin; `integration_id` nullable (RSS needs none) |
| Scan | one execution of a topic's pipeline | domain word; Temporal keeps "run" at the infra layer only |
| Resource | canonical external artifact, deduped globally | url, content hash, embedding, kind (read / watch / listen) |
| Finding | topic-scoped judgment about a Resource | relevance score, relevance explanation; one Resource → many Findings |
| Feed | a topic's stream of Findings | the output side; "channel" is UI copy only |
| Subscription | subscriber ↔ topic join | subscriber is a user **or** an Audience; delivery prefs live here; owners hold ordinary rows |
| Audience | a named set of users that subscribes as one | `audience_members` joins users; members inherit the audience's Subscription; a personal Subscription to the same topic shadows the inherited one |
| Integration | a user's connected external account | OAuth grant + scopes (Composio-managed or native); referenced by Sources (input) and Subscriptions (delivery) |

## Layering rules
- Integration = the credential; Source = an input use of it; delivery = an output use of it. Connected once, reused everywhere.
- Adapter = worker code turning a Source into Resources (see adapter-authoring). One composio adapter; toolkit variety lives in Source config, not code.
- Authority is only ever `topic.owner_id`. Access is only ever "a Subscription path exists." No role enums.
- A Resource is raw and global; a Finding is scored and topic-scoped. Don't blur them.

## Rejected terms — never introduce
- "Channel", "Follow" (UI copy only, never schema)
- "Item" (use Resource or Finding)
- "Update" (CRUD collision; use Scan or Finding)
- "Run" (Temporal's word, infra layer only; use Scan)
- "Crawl" (names one stage of five)
- "Group", "List", "Cohort" (use Audience)

## Rules
- Singular entity names in code (`Finding`), plural tables (`findings`).
- New domain