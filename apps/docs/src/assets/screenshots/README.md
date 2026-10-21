# Screenshots

Screenshots live here and are referenced by relative path from the page that uses them, so the number
of `../` steps depends on how deep that page sits:

```md
<!-- from a page at the content root, such as quickstart.md -->
![The topic page after a brew](../../assets/screenshots/topic-page.png)

<!-- from a page in a section folder, such as topics/attachments.md -->
![The topic page after a brew](../../../assets/screenshots/topic-page.png)
```

Never put a screenshot in `docs/public/` and never reference one by absolute path. Astro applies the
`/docs` base prefix to images it processes and does not apply it to absolute paths written by hand, so
an absolute reference resolves on the dev server and 404s in production — a break that passes every
local check.
