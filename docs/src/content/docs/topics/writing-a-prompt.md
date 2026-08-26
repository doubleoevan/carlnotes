---
title: Writing a prompt
description: >-
  The prompt decides everything Carl keeps or discards. How to say what you don't want,
  use Carl's notes as feedback, and put context where it belongs.
sidebar:
  order: 1
---

Everything Carl keeps or discards comes down to the prompt. Sources decide where he reads from. The prompt
decides what gets kept. When findings are wrong, the prompt is usually why, and rewriting it is the
first thing to try before touching anything else.

![The Edit your topic dialog with Carl's prompt front and
center](../../../assets/screenshots/prompt-editor.png)

## Say what you don't want

This is the part people skip, and the part that helps most. Carl can only exclude what you've told
him to exclude. Compare:

**Too broad:**

> Keep me up to date on AI coding tools.

**Better:**

> Keep me up to date on AI coding tools. I want releases, benchmarks, and hands-on teardowns. Skip
> listicles, funding announcements, hot takes about AI replacing programmers, and anything without
> technical detail.

The first prompt puts every blog post about AI in front of Carl. The second gives Carl a way to filter
the irrelevant ones out. The findings from the second prompt are sharper.

## Read Carl's notes as feedback

Every finding includes a note from Carl explaining why it matters. The app labels it
**Carl's Notes**. That note is your feedback. When a note reads like a stretch, "this mentions
coding, and it mentions AI, so", the prompt was too broad for Carl to use discretion. Tighten what to exclude
and Carl gets better judgement.

![A finding's popover, where Carl's Notes explains why the result made the
cut](../../../assets/screenshots/prompt-relevance-note.png)

## Name the content, not only the subject

Benchmarks, postmortems, teardowns, changelogs, job listings, papers: these read differently from
general commentary, and Carl can tell them apart. "Tech job market" gets you commentary. 
"New full-stack job listings, layoff announcements, and published salary bands" gets you
three specific types of relevant content.

## Say who you are

One line of reader context changes scoring more than people expect. "I'm a solo developer" makes
enterprise procurement news irrelevant without another word of exclusions. "I'm a beginner" reranks
everything toward introductions. Carl scores against the prompt, and who is asking is part of what
makes something relevant.

## Long context goes in an attachment

The prompt is the rule. An attachment is the background behind the rule. A resume, a product spec, a
list of things you've already seen: attach those documents instead of pasting them. Carl reads attachments on
every brew. Keep the prompt short enough that its rules stay sharp. See
[Attachments](/docs/topics/attachments/).

## Edit it any time

The prompt isn't locked. Open the topic's edit dialog with the pencil icon, rewrite
**Carl's prompt**, and save. The next brew does research based on the new version. Previous findings stay put in your **Brew diary**.

To check if a rewrite worked, run a brew with the **Brew** button and compare it against
the earlier entries in your **Brew diary** on the topic page. Read counts, kept counts, and the updated
findings will tell you whether the rewrite helped.

## What thumbs mean today

Each finding has a **Rate this find** control with a thumbs up and thumbs down. Ratings feed a topic feed's
**Trending** order, so that you and other readers can say what matters. They don't change how future
brews are scored. That's on the roadmap. Today, telling Carl what's relevant is in the prompt.
