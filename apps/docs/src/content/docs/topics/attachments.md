---
title: Attachments
description: >-
  Attachments are context that Carl reads on every brew. What to attach,
  what to keep in the prompt, and how attachments work.
sidebar:
  order: 3
---

An attachment is context, not a source. Carl reads an attachment to understand your prompt.

Keep these three apart:

- **The prompt is the rule.** It's short. It changes what Carl keeps.
- **An attachment is the background behind the rule.** It's long. It changes how well Carl understands the rule.
- **A source is a place to look.** It changes where Carl looks.

"Skip jobs I already applied to" is a rule, so it goes in the prompt. The list of 40 companies you already applied to is
background, so it goes in an attachment. A job board to watch is a place to look, so it goes in sources.

## Adding an attachment

There are two ways, both in the topic form:

- **The prompt box.** Press the paperclip in the **Carl's prompt** field, or drag a file onto the box. While a file is
  over the box, it turns into a drop zone that reads "Drop to attach", like the Coffee Talk message box. Files you add
  show as chips until you save.

![The Carl's prompt box while a file is dragged over it, outlined as a Drop to attach
zone](../../../assets/screenshots/attachments-drop-to-attach.png)

- **The attachments section.** Press **add an attachment** under **Attachments** to open a file picker.

A file can be text, PDF, Word (.docx), Excel (.xlsx), or an image, up to 10 MB each.

In the app, both ways offer **Photo library**, **Take photo**, and **Files**. A large photo is made smaller before it
uploads, and its location data is removed. A file over 10 MB is rejected before it uploads, and the rest of the
form stays as you left it.

![The attachments section of the topic editor: an uploaded file with its extracted content
expanded](../../../assets/screenshots/attachments-upload.png)

## Processing runs in the background

A new attachment's row appears at once, marked as pending. It fills in after Carl extracts the file's text. Each
extracted attachment's row has a **content** expander. It holds the text Carl took from the file, and you can read and
edit it. The editor describes it as "What Carl read from the file. Every brew reads it."

A short file keeps its words. Carl stores up to 20,000 characters, about six pages of text, exactly as written. That way
a list of names, places, or terms reaches every brew complete. Carl summarizes a longer file. The summary keeps the main
points, not every detail.

If Carl can't read a file, its row says why. A PDF made from a scan has no text to read unless it went through text
recognition. Attach a copy whose text you can select.

A spreadsheet or CSV keeps its rows. Carl stores the first 150 rows as they are, not a summary, under a line that names
the file, each sheet, and its columns. The 150 rows are shared across all sheets in the file. For a longer file, a line
says how many rows were left out.

Carl fetches a URL attachment as a signed-out visitor. For a page behind a login, Carl gets the login page, not your
document. Download the file and attach it instead.

## What's worth attaching

Attach background that changes how Carl reads your prompt:

- A resume, for a jobs topic.
- A screenshot or image, for a product.
- A product spec or README, for a competitor or ecosystem topic.
- A list of what you've already seen, applied to, or bought.
- A list of names to follow or to leave out, with the prompt saying which.

## What to leave out

Don't put instructions in an attachment. An exclusion rule on page 12 of a PDF is one more sentence Carl has read. Move
the rule to the prompt.

Skip material Carl can fetch himself. A public blog you want him to watch is a source, not an attachment.

## Removing one

Press the X on the attachment's row. Future brews score without it. Findings from earlier brews stay where they are.
