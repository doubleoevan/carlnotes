---
name: ingester-authoring
description: Conventions for writing CarlNotes source ingesters. Use when creating or modifying any ingester that fetches content from an external Source (RSS, Reddit, web search, Composio, crawling).
---

# Ingester authoring

An ingester turns one kind of Source into Resources. One ingester per source kind, one file each, colocated tests.

## Conventions
- Location: `worker/ingest/<kind>.ts` with `worker/ingest/<kind>.test.ts`.
- Naming: `<kind>Ingester` (e.g. `rssIngester`, `redditIngester`, `composioIngester`).
- Output: Resources only. Ingesters never score, rank, or touch Findings — that's the review pipeline's job.
- One `composioIngester` covers all Composio toolkits: toolkit variety lives in Source config, not in ingester code.
- Credentials come from the Source's referenced Integration, resolved through the established config path. Never read keys inline; never assume an Integration exists (`integration_id` is nullable — RSS needs none).
- Keyless first: prefer credential-free access (RSS) as the baseline; Integration-backed variants layer on top, never replace the fallback.
- Idempotent: re-scanning the same Source must not duplicate Resources. Dedupe on the Resource's canonical URL.
- Rate limits and retries are handled by the ingester, with limits declared as constants at the top of the file, not buried in call sites.
- Errors: a failing Source degrades that Scan only. Never let one ingester's failure abort a whole Scan batch.

## Interface
The shared ingester interface is `worker/ingest/ingester.ts` (`SourceIngester` in, `IngestResult` out). Implement it exactly instead of inventing a variant.