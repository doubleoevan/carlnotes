// the server-rendered blog pages: Markdown under content/blog/, rendered to HTML in Hono
import { readdir } from "node:fs/promises"
import { appUrl } from "@shared/appUrl"
import { toPageTitle } from "@shared/seo"
import { Hono } from "hono"
import Markdown from "markdown-to-jsx"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { renderedCacheHeaders } from "./edgeCache"
import { toJsonLdTag } from "./seo"
import { cacheForTtl } from "./ttlCache"

// the content directories, resolved from this file so the api serves them from any working directory
const CONTENT_ROOT = `${import.meta.dir}/../content`

// each section: the folder under content/ it reads, the path it serves at, its index title, and
// the JSON-LD type it gives its pages. the blog is the only one
const SECTIONS = {
	blog: { title: "Blog", description: "Notes of Carl.", jsonLdType: "BlogPosting" },
} as const
type Section = keyof typeof SECTIONS

// one page: its frontmatter fields, the slug from its filename, and the Markdown body
type ContentPage = { slug: string; title: string; description: string; date: string; body: string }

// how long a section's parsed pages are kept before a read lists and parses its files again
const PAGES_TTL_MS = 60_000

// each section's page loader, which keeps the parsed pages for the ttl
const sectionPageLoaders = {
	blog: cacheForTtl(() => readPages("blog"), PAGES_TTL_MS),
} satisfies Record<Section, () => Promise<ContentPage[]>>

/**
 * Returns every page under one section's folder, newest first.
 * The files are read again once the kept pages are a minute old, so a new page ships by adding a file and appears within that minute.
 */
export function loadPages(section: Section): Promise<ContentPage[]> {
	return sectionPageLoaders[section]()
}

// read every page under one section's folder, newest first, skipping any file whose frontmatter is missing a field
async function readPages(section: Section): Promise<ContentPage[]> {
	const filenames = (await readdir(`${CONTENT_ROOT}/${section}`)).filter((filename) => filename.endsWith(".md"))
	const pages = await Promise.all(
		filenames.map(async (filename) =>
			toPage(filename, await Bun.file(`${CONTENT_ROOT}/${section}/${filename}`).text()),
		),
	)
	return pages.filter((page) => page !== null).sort((first, second) => second.date.localeCompare(first.date))
}

// parse one file's Markdown into a page, or null if its frontmatter is incomplete
function toPage(filename: string, markdown: string): ContentPage | null {
	const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
	if (!match?.[1] || match[2] === undefined) {
		return null
	}

	// the frontmatter block is "key: value" lines, and the slug is the filename without its extension
	const fields = Object.fromEntries(
		match[1]
			.split("\n")
			.map((line) => line.split(/:\s(.*)/, 2))
			.filter((pair) => pair.length === 2)
			.map(([key, value]) => [key?.trim(), value?.trim()]),
	)
	const { title, description, date } = fields
	if (!title || !description || !date) {
		return null
	}
	return { slug: filename.replace(/\.md$/, ""), title, description, date, body: match[2] }
}

// the coffee-toned page colors the emails already use, so the blog reads as the same sender
const PAGE_STYLE = `
	body { margin: 0; background: #f4f1ea; color: #2b2b2b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; }
	main { max-width: 42rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
	a { color: #7c4a1e; }
	/* the wordmark in the header, then the type a page and an index card set */
	header a { text-decoration: none; font-weight: 700; font-size: 18px; }
	h1 { font-size: 28px; line-height: 1.25; }
	.post-date { color: #6b5b4a; font-size: 14px; }
	.post-card { margin-top: 1.5rem; }
`

/**
 * One full content page: the head a crawler reads, the coffee-toned page frame, and the given body HTML.
 */
export function toContentHtml({
	title,
	description,
	canonicalUrl,
	jsonLd,
	bodyHtml,
}: {
	// the head fields: the title and description, the page's own canonical url, and a JSON-LD tag or ""
	title: string
	description: string
	canonicalUrl: string
	jsonLd: string
	// the rendered content under the header
	bodyHtml: string
}): string {
	return [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="UTF-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1.0">',
		`<title>${Bun.escapeHTML(toPageTitle(title))}</title>`,
		`<meta name="description" content="${Bun.escapeHTML(description)}">`,
		`<link rel="canonical" href="${canonicalUrl}">`,
		'<link rel="alternate" type="application/rss+xml" title="CarlNotes" href="/feed.xml">',
		jsonLd,
		`<style>${PAGE_STYLE}</style>`,
		"</head>",
		"<body>",
		"<main>",
		'<header><a href="/">☕ CarlNotes</a></header>',
		bodyHtml,
		"</main>",
		"</body>",
		"</html>",
	].join("\n")
}

/**
 * Markdown rendered to static HTML with the renderer the app already ships.
 */
export function toPageHtml(markdown: string): string {
	return renderToStaticMarkup(createElement(Markdown, null, markdown))
}

// one section's index: every page listed newest first, no JSON-LD of its own
async function serveIndex(section: Section): Promise<string> {
	const { title, description } = SECTIONS[section]
	// one card per page: its linked title, its date, and its description
	const cards = (await loadPages(section))
		.map(
			(page) => `
				<article class="post-card">
					<h2><a href="/${section}/${page.slug}">${Bun.escapeHTML(page.title)}</a></h2>
					<div class="post-date">${page.date}</div>
					<p>${Bun.escapeHTML(page.description)}</p>
				</article>`,
		)
		.join("")
	return toContentHtml({
		title,
		description,
		canonicalUrl: `${appUrl()}/${section}`,
		jsonLd: "",
		bodyHtml: `
			<h1>${title}</h1>
			${cards}`,
	})
}

// one page by its slug with its structured data, or null for a slug matching no file
async function servePage(section: Section, slug: string): Promise<string | null> {
	const page = (await loadPages(section)).find((page) => page.slug === slug)
	if (!page) {
		return null
	}

	// the page includes its section's structured data beside its title and canonical url
	const canonicalUrl = `${appUrl()}/${section}/${page.slug}`
	const jsonLd = toJsonLdTag({
		"@context": "https://schema.org",
		"@type": SECTIONS[section].jsonLdType,
		headline: page.title,
		description: page.description,
		datePublished: page.date,
		url: canonicalUrl,
	})
	return toContentHtml({
		title: page.title,
		description: page.description,
		canonicalUrl,
		jsonLd,
		bodyHtml: `
			<article>
				<h1>${Bun.escapeHTML(page.title)}</h1>
				<div class="post-date">${page.date}</div>
				${toPageHtml(page.body)}
			</article>`,
	})
}

// the content routes: the blog's index and its page route
export const contentRoute = new Hono()
	.get("/blog", renderedCacheHeaders, async (context) => context.html(await serveIndex("blog")))
	.get("/blog/:slug", renderedCacheHeaders, async (context) => {
		const html = await servePage("blog", context.req.param("slug"))
		return html ? context.html(html) : context.text("Not found", 404)
	})
