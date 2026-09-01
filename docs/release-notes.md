# Writing a release

GitHub Releases is where release notes are authored. [carlnotes.com/releases](https://carlnotes.com/releases)
is where they are read. There is no second changelog to keep in step.

## The body

A release body has three parts, in this order:

```markdown
A hand-written summary. Two or three paragraphs on what shipped and why it matters,
in the product's voice. This is what the releases index shows and what an email would
send, so it has to stand alone.

<!-- more -->

<details>
<summary>Everything in this release</summary>

<!-- GitHub's generated pull request list goes here -->

</details>
```

The `<!-- more -->` sentinel is load-bearing. `/releases` renders only what sits above it, and each
release's own page at `/releases/<tag>` renders the whole thing. A body written without the sentinel
renders whole in both places — ugly on the index, not broken.

`.github/release.yml` sorts the generated list into Features, Fixes, Dependencies, and Other changes
by pull request label, and leaves out dependency bots.

## Images

Reference an image by an absolute URL, never by dragging it into GitHub's editor. GitHub's attachment
URLs are tied to the release's own rendering context, so they serve the release page and nothing else.
An absolute URL serves the release, `/releases`, and a later release email from one asset.

Today that URL is the raw file in this repository, which is where the docs screenshots already live:

```
https://raw.githubusercontent.com/doubleoevan/carlnotes/main/docs/src/assets/screenshots/<name>.png
```

It reads from `main`, so an image referenced before its branch merges resolves once it lands. Move
these to a public object-storage URL when there is one; nothing about the convention changes but the
host.

## Publishing

Write the body to a gitignored `release-notes/<tag>.local.md`, then:

```bash
gh release create v1.2.0 --draft --title "v1.2.0 — What it is" --notes-file release-notes/v1.2.0.local.md
```

Drafts are visible only to people with push access and do not create the tag. Review, then publish
from GitHub.

Publishing fires the `release` webhook, which upserts the row `/releases` reads. Nothing else is
needed — the page is current within a second.

## When the page is behind GitHub

A webhook delivery can be missed. The sync script is the repair, and it is safe to run at any time:

```bash
bun run sync:releases
```

It reads every published release from the GitHub API and upserts each one by tag, so it reconciles a
dropped delivery and seeds releases published before the webhook existed. Running it twice changes
nothing the first run already did.
