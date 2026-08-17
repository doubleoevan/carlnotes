---
title: Adding sources
description: >-
  The nine source kinds and what each is good for, the Recommend button, results per brew,
  scheduling, and what to check when a topic goes quiet.
sidebar:
  order: 2
---

Sources are what Carl conducts his research with. A topic holds up to 10, and when you hit the cap the app tells you:
"Carl reads 10 sources per topic. Drop one to add another."

![The sources editor: the web source and three subreddits, under the 10-source
cap](../../../assets/screenshots/sources-list.png)

## The source kinds

Every new topic starts with the **web** source on, labeled "Let Carl crawl". It's Carl's own web
search. Press **+ add a source** for the more:

- **url**: a page that Carl re-reads with each brew. Good for a jobs page, a changelog, or any page that
  updates in place.
- **rss**: a feed url. The most reliable kind, since feeds exist to be read by machines and rarely
  block or rate-limit a reader the way a normal page does.
- **Google News**: a Google News query, good for tracking a subject across many outlets at once.
- **reddit**: a subreddit. Good coverage for niche interests, but Reddit rate-limits heavily, so this
  kind of source fails more brews than any other.
- **youtube**: a video channel. Carl reads the video transcripts, not just the titles.
- **podcast**: a show. Carl reads episode transcripts.
- **bluesky** and **x**: an account on either network, for tracking a specific user.

If a site you care about publishes a feed, prefer **rss** over pointing **url** at its homepage. The
feed gets you every new post with none of the fetch failures.

## Let Carl recommend sources

Press **Recommend** in the source editor, and Carl proposes sources based on your topic's title,
prompt, and attachments. He proposes three at a time, up to as many as the topic has open slots. Every proposal
is fetched live before you see it, so a source that doesn't work is not suggested. 

![The Recommend button below the source list, next to add a
source](../../../assets/screenshots/sources-suggest-button.png)

Recommendations are based on the prompt. After rewriting a prompt, delete your sources and run **Recommend** again: a sharper prompt
gets better source proposals.

## Sources are not attachments

Sources are where Carl looks. Attachments are what he reads to understand you. A subreddit belongs
in sources. Your resume belongs in attachments. Only you can download and see your attachments. See
[Attachments](/docs/topics/attachments/).

## Results per brew

**Max results** sets how many findings each brew keeps and ranks: Carl's top 5, 10, 15, or 20. 
A smaller set makes Carl's more selective, which raises the quality of what gets kept.

## Schedule

**Frequency** is **Daily**, **Weekdays**, or **Weekly**, at the time you pick, with a day of the
week for weekly topics. Your plan caps how many topics run daily or on weekdays; the editor shows the
count as "N daily Brews left". Weekly topics don't count against that cap. Brews also run on demand
with the **Brew** button, up to your plan's daily brew count.

## When a topic goes quiet

Try these fixes in order:

1. **Check the prompt.** If the last brews read plenty but kept nothing, the prompt's exclusions may
   now reject everything. The **Brew diary** shows "read N · kept N" per brew.
2. **Check the sources.** Open the brew recap on the topic page. Carl names sources that failed or
   came back empty, such as a rate-limited subreddit or a feed that stopped publishing.
3. **Check max results.** Top 5 on a broad topic keeps almost nothing. Raise it.
4. **Check the web source.** If you removed "Let Carl crawl", the topic only sees its listed
   sources. Turn it back on and Carl can search the web again.
