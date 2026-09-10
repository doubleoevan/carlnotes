# Writing a release

GitHub Releases is where release notes are authored. [carlnotes.com/releases](https://carlnotes.com/releases)
is where they are read. There is no second changelog to keep in step.

## The cycle

1. Write the body in `release-notes/<tag>.local.md`, a gitignored scratch file.
2. Preview it on the dev server (below) until it reads right.
3. Commit and push the code, and wait for the deploy.
4. Create the release on GitHub from the file (below). The webhook puts it on `/releases` within a second.
5. Edit it on GitHub from then on. The webhook carries each edit to `/releases` too.

The GitHub body is the canonical copy once published. The local file is scratch, and it can be
recreated from GitHub at any time (below).

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

## Previewing locally

Before the release exists on GitHub, read it as the pages will render it:

```bash
bun run releases:preview v1.2.0 "v1.2.0 — What it is"
```

It stores the body from `release-notes/v1.2.0.local.md` in the dev database under that tag, with every
image the body names inlined from this repository, since the raw URL only resolves once the branch merges.
Open `http://localhost:3000/releases/v1.2.0` and `http://localhost:3000/releases`. Publishing the real
release later replaces the row by tag.

## Publishing

After the push, with the deploy up so the page never announces what the site does not have yet:

```bash
gh release create v1.2.0 --title "v1.2.0 — What it is" --notes-file release-notes/v1.2.0.local.md
```

Add `--draft` to look at it on GitHub first. Drafts are visible only to people with push access and do
not create the tag; publish from GitHub when ready. Publishing fires the `release` webhook, which
upserts the row `/releases` reads. Nothing else is needed.

## Editing a published release

Edit on GitHub, with the pencil on the release page, or from the local file:

```bash
gh release edit v1.2.0 --notes-file release-notes/v1.2.0.local.md
```

The webhook stores an edit the way it stores a publish, so `/releases` follows within a second. To edit
locally when the file is gone, or has drifted from what GitHub holds, pull the body back down first:

```bash
gh release view v1.2.0 --json body --jq .body > release-notes/v1.2.0.local.md
```

## Updating a screenshot

A screenshot is a file in this repository, so a new one is a commit, not a release edit. Drop the new
PNG over the old one under the same name, commit, and push: the raw URL serves the new image, and the
docs pages, which reference the same files by relative path, update in the same commit. The raw host
caches for a few minutes, so the old image can linger that long. A screenshot under a new name also
needs the body's image line edited to the new name.

## When the page is behind GitHub

A webhook delivery can be missed. The sync script is the repair, and it is safe to run at any time:

```bash
bun run sync:releases
```

It reads every published release from the GitHub API and upserts each one by tag, so it reconciles a
dropped delivery and seeds releases published before the webhook existed. Running it twice changes
nothing the first run already did. `bun run sync:releases:prd` does the same against production.
