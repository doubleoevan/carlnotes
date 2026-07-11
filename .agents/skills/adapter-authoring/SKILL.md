---
name: adapter-authoring
description: Conventions for writing CarlNotes source ingestion adapters. Use when creating or modifying any adapter that fetches content from an external Source (RSS, Reddit, web search, Composio, crawling).
---

# Adapter authoring

An adapter turns one kind of Source into Resources. One adapter per source kind, one file each, colocated tests.

## Conventions
- Location: `worker/adapters/<kind>.ts` with `worker/adapters/<kind>.test.ts`.
- Naming: `<kind>Adapter` (e.g. `rssAdapter`, `redditAdapter`, `composioAdapter`).
- Output: Resources only. Adapters never score, rank, or touch Findings — that's the curation pipeline's job.
- One `composioAdapter` covers all Composio toolkits: toolkit variety lives in Source config, not in adapter code.
- Credentials come from the Source's referenced Integration, resolved through the established config path. Never read keys inline; never assume an Integration exists (`integration_id` is nullable — RSS needs none).
- Keyless first: prefer credential-free access (RSS) as the baseline; Integration-backed variants layer on top, never replace the fallback.
- Idempotent: re-scanning the same Source must not duplicate Resources. Dedupe on the Resource's canonical URL.
- Rate limits and retries are handled by the adapter, with limits declared as constants at the top of the file, not buried in call sites.
- Errors: a failing Source degrades that Scan only. Never let one adapter's failure abort a whole Scan batch.

## Interface
The shared adapter interface is defined by the source-ingestion OpenSpec change. Until it lands, match the shape of the most recently merged adapter rather than inventing a variant.