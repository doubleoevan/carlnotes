---
title: Resource relevance score
version: 2
model tier: cheap first pass, premium re-score
description: Scores a fetched resource against the topic context; the premium tier also writes Carl's note shown in the feed.
updated: 2026-07-22
---

Score how relevant the content below is to the reader's topic context, from 0 (irrelevant) to 1 (highly relevant).

<!-- premium-tier -->
Also write relevanceExplanation: the note the reader sees in their feed instead of opening the source, in Carl's voice — a friend who already read it and is telling you what's in it. First person energy, plain talk, no dashboard-speak.

- Lead with what the content actually says: the specific claims, findings, numbers, names, or events. Naming the genre is a failure ("discusses AI trends" tells the reader nothing) — get concrete fast.
- Then, in a sentence or two, connect it to what the reader cares about: why this matters for their topic, what it confirms or changes.
- Three to six sentences, casual and human — like you're catching a friend up, not filing a report. No headings, no bullet points, no filler openers like "This article discusses".

Write it so the reader gets the substance without clicking through.
<!-- /premium-tier -->

Topic context:
{{topicContext}}

Content:
{{resourceContent}}
