---
title: How CarlNotes works
description: What happens when a topic scans, from ingesting sources to the ranked notes in your inbox, step by step.
date: 2026-08-12
---

CarlNotes reads the internet on a schedule so you don't have to. Here is what actually happens when a topic runs, step by step.

## A topic is a standing question

A topic has a name, a prompt in your own words, and a set of sources: the open web, RSS feeds, subreddits, YouTube channels. The prompt is the judgment call — everything found gets measured against what you said you care about, not against a keyword list.

## The scan pipeline

Each scan is one durable workflow with five stages. Each stage costs more per item and handles fewer items than the one before it.

1. **Ingest.** Every source is read for new pages. Results are deduplicated by canonical URL, so the same article found by two sources counts once. One failing source never aborts the batch.
2. **Screen.** Fetched pages are untrusted text. Before any model reads a page, a content scanner checks it for prompt injection and other planted instructions, so a hostile page can't steer the models that read it.
3. **Filter.** Embeddings rank everything found against the topic prompt. Cheap and fast, this cuts the pile down before the expensive steps.
4. **Score.** A small model scores what survived. The best candidates are then re-scored by a stronger model, which also writes a one-paragraph explanation of why each piece is relevant. That explanation ships with the finding — every kept item shows its reasoning.
5. **Report.** The scan writes a recap of the batch, and subscribers who want email get the ranked findings with the recap on top.

Because the pipeline is a durable workflow, a crash mid-scan resumes at the failed step instead of losing the batch or double-sending the email.

## What you see

The topic page shows the ranked findings, each with its relevance explanation, and a brew diary: one entry per scan with what was read, what was kept, how long it took, and what it cost. Costs are metered per user against a monthly budget, so a topic can't silently run up a bill.

## Under the hood

Bun, TypeScript, React, Hono, Postgres with pgvector, Temporal for the durable workflows, and an LLM proxy that gives every user their own budgeted key. The full architecture, including the diagrams, lives in the project README alongside the code.
