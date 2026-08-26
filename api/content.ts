// the server-rendered blog pages: Markdown under content/blog/, rendered to HTML in Hono
import { readdirSync, readFileSync } from "node:fs"
import { Hono } from "hono"
import Markdown from "markdown-to-jsx"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { toJsonLdTag } from "./seo"

// the content directories, resolved from this file so the api serves them from any working directory
const CONTENT_ROOT = `${import.meta.dir}/../content`

// the one surface: where it reads from, its index title, and the JSON-LD type it gives its pages
const SURFACES = {
	blog: { title: "Blog", description: "Notes of Carl.", jsonLdType: "BlogPosting" },
} as const
type Surface = keyof typeof SURFACES

// one page: its frontmatter fields, the slug from its filename, and the Markdown body
type ContentPage = { slug: string; title: string; description: string; date: string; body: string }

/**
 * Every page under one surface's folder, newest first. Read per request, so a new page ships by adding a file.
 */
export function loadPages(surface: Surface): ContentPage[] {
	// one page per markdown file, skipping any file whose frontmatter is missing a field
	const pages = readdirSync(`${CONTENT_ROOT}/${surface}`)
		.filter((filename) => filename.endsWith(".md"))
		.flatMap((filename) => {
			const page = toPage(surface, filename)
			return page ? [page] : []
		})
	return pages.sort((first, second) => second.date.localeCompare(first.date))
}

// parse one file into a page, or null when its frontmatter is incomplete
function toPage(surface: Surface, filename: string): ContentPage | null {
	const source = readFileSync(`${CONTENT_ROOT}/${surface}/${filename}`, "utf8")
	const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
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

// one full blog page: the head a crawler reads, the coffee-toned chrome, and the given body HTML
function toContentHtml({
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
	const escapedTitle = Bun.escapeHTML(title)
	return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapedTitle} — CarlNotes</title><meta name="description" content="${Bun.escapeHTML(description)}"><link rel="canonical" href="${canonicalUrl}">${jsonLd}<style>${PAGE_STYLE}</style></head><body><main><header><a href="/">☕ CarlNotes</a></header>${bodyHtml}</main></body></html>`
}

// a page's Markdown rendered to static HTML with the renderer the app already ships
function toPageHtml(markdown: string): string {
	return renderToStaticMarkup(createElement(Markdown, null, markdown))
}

// one surface's index: every page listed newest first, no JSON-LD of its own
function serveIndex(surface: Surface): string {
	const { title, description } = SURFACES[surface]
	const cards = loadPages(surface)
		.map(
			(page) =>
				`<article class="post-card"><h2><a href="/${surface}/${page.slug}">${Bun.escapeHTML(page.title)}</a></h2><div class="post-date">${page.date}</div><p>${Bun.escapeHTML(page.description)}</p></article>`,
		)
		.join("")
	return toContentHtml({
		title,
		description,
		canonicalUrl: `${contentAppUrl()}/${surface}`,
		jsonLd: "",
		bodyHtml: `<h1>${title}</h1>${cards}`,
	})
}

// one page by its slug with its structured data, or null for a slug matching no file
function servePage(surface: Surface, slug: string): string | null {
	const page = loadPages(surface).find((page) => page.slug === slug)
	if (!page) {
		return null
	}

	// the page carries its surface's structured data beside its title and canonical url
	const canonicalUrl = `${contentAppUrl()}/${surface}/${page.slug}`
	const jsonLd = toJsonLdTag({
		"@context": "https://schema.org",
		"@type": SURFACES[surface].jsonLdType,
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
		bodyHtml: `<article><h1>${Bun.escapeHTML(page.title)}</h1><div class="post-date">${page.date}</div>${toPageHtml(page.body)}</article>`,
	})
}

// the content routes: the blog's index and its page route
export const contentRoute = new Hono()
	.get("/blog", (context) => context.html(serveIndex("blog")))
	.get("/blog/:slug", (context) => {
		const html = servePage("blog", context.req.param("slug"))
		return html ? context.html(html) : context.text("Not found", 404)
	})

// the app's public base url, the same source every other shell route reads
function contentAppUrl(): string {
	return (Bun.env.BETTER_AUTH_URL ?? "http://localhost:5173").replace(/\/$/, "")
}
