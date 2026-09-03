---
title: Attachments
description: >-
  Attachments are context that Carl reads on every brew. What to attach,
  what to keep in the prompt, and how attachments work.
sidebar:
  order: 3
---

An attachment is context, not a source. Carl reads an attachment to understand your prompt better. 

The three-way split, worth keeping straight:

- **The prompt is the rule.** Short. It changes what Carl keeps.
- **An attachment is the background behind the rule.** Long. It changes how well Carl understands
  the rule.
- **A source is a place to look.** It changes where Carl looks.

"Skip jobs I already applied to" is a rule, so it goes in the prompt. The list of 40 companies you
already applied to is background, so it goes in an attachment. A job board to watch is a place to look, so
it goes in sources.

## Adding an attachment

Two ways, both in the topic form:

- **The prompt box.** Press the paperclip in the **Carl's prompt** field, or drag a file onto the
  box. While a file is over it, the box becomes a drop zone reading "Drop to attach", the same
  way the Coffee Talk message box does. Staged files show as chips until you save.

![The Carl's prompt box while a file is dragged over it, outlined as a Drop to attach
zone](../../../assets/screenshots/attachments-drop-to-attach.png)

- **The attachments section.** Press **add an attachment** under **Attachments** to open a file
  picker.

Files can be text, PDF, Word (.docx), Excel (.xlsx), or images, up to 10 MB each.

![The attachments section of the topic editor: an uploaded file with its extracted content
expanded](../../../assets/screenshots/attachments-upload.png)

## Processing runs in the background

A new attachment's row appears at once in a pending state, and fills in after Carl extracts its text. 
For each extracted attachment the row shows a **content** expander: the text
Carl actually took from the file, which you can read and edit. The editor describes it:
"What Carl read from the file. Every brew reads it."

A spreadsheet or CSV keeps its rows. Instead of a summary, Carl stores the first 150 rows as they
are, under a line naming the file, each sheet, and its columns. A longer file notes how many rows were left out.

A URL attachment is fetched as an anonymous visitor. A page behind a login wall gives Carl the login
page, not your document. Download the file and attach it instead.

## What's worth attaching

Background that changes how Carl reads your prompt:

- A resume, for a jobs topic.
- A screenshot or image, for a product.
- A product spec or README, for a competitor or ecosystem topic.
- A list of what you've already seen, applied to, or bought.

## What to leave out

Don't put instructions in an attachment. An exclusion rule buried on page 12 of a PDF is one more
sentence Carl has read, move it to the prompt.

Skip material Carl can fetch himself. A public blog you want him to watch is a source, not an
attachment.

## Removing one

Press the X on the attachment's row. Future brews score without it, and findings from previous brews
stay where they are.
