---
title: Adding sources
description: >-
  The nine source kinds and what each is good for, the Recommend button, results per brew,
  scheduling, and what to check when a topic goes quiet.
sidebar:
  order: 2
---

Sources are where Carl does his research. A topic holds up to 10. When you reach the limit, the editor says so: "Carl
reads 10 sources per topic. Drop one to add another."

![The sources editor: the web source and three subreddits, under the 10-source
limit](../../../assets/screenshots/sources-list.png)

## The source kinds

Every new topic starts with the **web** source on, labeled "Let Carl crawl". It's Carl's own web search. Press
**+ add a source** for the other kinds:

- **url**: a page that Carl reads again on every brew. Use it for a jobs page, a changelog, or any page that updates in
  place.
- **rss**: a feed url. An RSS feed is a list of updates that a site publishes for apps to read. Feeds block readers
  and limit their requests less often than normal pages do, so rss is the most reliable kind.
- **Google News**: a news publisher's domain. Carl reads that publisher's articles through Google News.
- **reddit**: a subreddit. It's good for niche interests. Reddit strictly limits how often a reader can fetch, so this
  kind fails more brews than any other.
- **youtube**: a channel id or a playlist id. Carl reads the video transcripts, not only the titles.
- **podcast**: a show, by its podcast id. Carl reads episode transcripts.
- **bluesky** and **x**: an account on either network, by its handle. Carl reads the links that account shares.

## Let Carl recommend sources

Press **Recommend** in the source editor. Carl proposes sources based on your topic's title, prompt, and attachments. He
proposes up to three at a time, and never more than the topic has open slots. Carl fetches every proposal before you see
it, so he never recommends a source that doesn't work.

![The Recommend button below the source list, next to add a
source](../../../assets/screenshots/sources-recommend-button.png)

Recommendations follow the prompt. After you rewrite a prompt, delete your sources and press **Recommend** again. A
sharper prompt gets better recommendations.

## Sources are not attachments

Sources are where Carl looks. Attachments are what he reads to understand you. A subreddit belongs in sources. Your
resume belongs in attachments. Only you can see and download your attachments. See
[Attachments](/docs/topics/attachments/).

## Results per brew

**Max results** sets how many findings each brew keeps and ranks: Carl's top 5, 10, 15, or 20. A smaller number makes
Carl more selective, so he keeps only his strongest findings.

## Schedule

**Frequency** is **Daily**, **Weekdays**, or **Weekly**, at the time you pick. Weekly topics also take a day of the
week. Your plan limits how many topics run daily or on weekdays. The editor shows what's left as "N daily Brews left".
Weekly topics don't count against that limit. You can also start a brew at any time with the **Brew** button, up to your
plan's daily brew count, or past it as overage on a monthly paid plan with a card. See
[Plans and limits](/docs/account/plans-and-limits/).

## If a topic goes quiet

Try these fixes in order:

1. **Check the prompt.** If the last brews read plenty but kept nothing, the prompt's exclusions are filtering out
   everything. The **Brew diary** shows "read N · kept N" for each brew.
2. **Check the sources.** Open the brew recap on the topic page. Carl names the sources that failed or came back empty,
   such as a subreddit that limited Carl's requests or a feed that stopped publishing.
3. **Check max results.** Top 5 keeps only 5 findings per brew, which leaves a broad topic thin. Raise it.
4. **Check the web source.** If you removed "Let Carl crawl", the topic reads only its listed sources. Turn the web
   source back on, and Carl searches the web again.
