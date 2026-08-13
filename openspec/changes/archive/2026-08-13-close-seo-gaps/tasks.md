## 1. Robots and sitemap

- [x] 1.1 Add `ui/public/robots.txt` allowing all crawlers and naming the sitemap's absolute URL
- [x] 1.2 Add `GET /sitemap.xml` in Hono ahead of the static catch-all: static routes plus public shown Topics and the profiles owning one, from a live query

## 2. Canonicals and titles through the injection seam

- [x] 2.1 Grow `withoutReplacedTags` to also strip the shell's `<title>` and canonical link, and the injectors to append their own pair
- [x] 2.2 Give the topic shell route its `{topic name} — CarlNotes` title and per-topic canonical url
- [x] 2.3 Add `toProfilePreview` and the `GET /profiles/:userId` shell route, mirroring the topic one's fall-through
- [x] 2.4 Add a homepage shell handler for `/` so it can inject, preserving the shell's caching behavior and missing-bundle fall-through
- [x] 2.5 Give the plans, terms, and privacy paths a shell route that serves each one's title and canonical url

## 3. Structured data

- [x] 3.1 Append Organization and SoftwareApplication JSON-LD on the homepage shell, offers from `PLANS`, `sameAs` from a constant that starts empty
- [x] 3.2 Append CreativeWork JSON-LD on public topic pages: `dateModified` from the last succeeded Scan, the owner as author, CarlNotes as publisher and isPartOf
- [x] 3.3 Add the blog index and posts to the sitemap, and `data-nosnippet` on the Attribution component so snippets stop quoting the persona credit
- [x] 3.4 Move the plans page from /pricing to /plans while nothing is indexed, with a 301 on the old path and every internal link updated

## 4. The blog

- [x] 4.1 Add `content/` with the launch posts — what-is-carlnotes, how-carlnotes-works, carlnotes-vs-google-alerts, carlnotes-glossary, who-is-carl — and the frontmatter splitter: title, description, date, slug from the filename. The Dockerfile's runtime stage copies named directories only, so it gains `COPY content ./content`
- [x] 4.2 Render `/blog`, `/docs`, and their page routes server-side with `markdown-to-jsx` through `renderToStaticMarkup`, one shared renderer over `content/blog/` and `content/docs/`, 404 on an unknown slug
- [x] 4.3 Give each blog page its title, description, canonical url, and BlogPosting JSON-LD

## 5. Findings in the structured data and the profile card

- [x] 5.1 Carry the last succeeded Scan's Findings in the topic CreativeWork as a ranked hasPart ItemList: title, link, and relevance explanation, the scan email's own content
- [x] 5.2 Drop profiles from the sitemap: thin pages keep their canonical url and card but are not promoted
- [x] 5.3 Render the profile preview card at `GET /api/profiles/:userId/preview.png` and point the profile OG tags at it: avatar and username in the title slot, public topics bottom left, followers bottom right
- [x] 5.4 Inject the same findings as a noscript body on public topic pages, built from the same rows as the ItemList, through a body seam on `toShellWithHeadTags`
- [x] 5.5 Gate the CreativeWork and the noscript body to public topics: a private or invite page serves its card tags alone

## 6. Verification

- [x] 6.1 Fetch robots, the sitemap, a topic page, a profile page, the homepage, and a blog post with scripts off, and confirm each head carries exactly one canonical url and one title, its own
- [x] 6.2 Validate the JSON-LD blocks: each parses as JSON with the right @type and fields (jq). Run Google's Rich Results test against production after deploy
- [x] 6.3 Confirm the sitemap drops a Topic switched to private on the next request
- [x] 6.4 `bash scripts/preflight.sh` green
