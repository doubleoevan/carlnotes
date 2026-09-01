// the seo files for the shell routes: the live sitemap, the JSON-LD structured data,
// and the machine-readable discovery files beside them: llms.txt, llms-full.txt, and security.txt
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PLANS } from "@shared/plans"
import { and, desc, eq } from "drizzle-orm"
import { db } from "../db"
import { findings, resources, scans, teams, topics } from "../db/schema"
import { isShown } from "./topic/permissions"

// the SPA routes the sitemap always lists, and the discovery files this module generates
// biome-ignore format: one line keeps the list under the comment-density hook's limit
const STATIC_ROUTES = ["/", "/plans", "/terms", "/privacy", "/llms.txt", "/llms-full.txt", "/feed.xml", "/.well-known/security.txt"]

// how many topics llms.txt lists
const LLMS_TOPIC_LIMIT = 50

// where the docs markdown lives, resolved from this file so the api reads it from any working directory
const DOCS_ROOT = join(import.meta.dir, "..", "docs", "src", "content", "docs")

// the official CarlNotes accounts, which tell a search engine that this site and its social profiles are one organization.
const ORGANIZATION_PROFILES = [
	"https://x.com/notesofcarl",
	"https://bsky.app/profile/notesofcarl.bsky.social",
	"https://www.reddit.com/user/notesofcarl/",
]

/**
 * The sitemap, built from live data on each request: the static routes, the blog pages, and every public Topic.
 * Profile pages keep their canonical url and preview card but are too thin to promote to a crawler.
 * The docs are absent because they are statically built files instead of anything this route can read, and the docs site emits its own sitemap.
 */
export async function toSitemapXml(appUrl: string, blogPaths: string[] = []): Promise<string> {
	// the public topics, each one added to the sitemap as its own page
	const topicRows = await publicTopicRows()

	// the public teams, each with its own page
	const teamRows = await db.select({ id: teams.id }).from(teams).where(eq(teams.isPublic, true))

	// one entry per url. topics have a lastmod, the rest are plain locations
	const entries = [
		...STATIC_ROUTES.map((path) => toSitemapEntry(`${appUrl}${path === "/" ? "" : path}`)),
		...blogPaths.map((path) => toSitemapEntry(`${appUrl}${path}`)),
		...topicRows.map((topicRow) => toSitemapEntry(`${appUrl}/topics/${topicRow.id}`, topicRow.updatedAt)),
		...teamRows.map((teamRow) => toSitemapEntry(`${appUrl}/teams/${teamRow.id}`)),
	]
	return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`
}

/**
 * Every topic the discovery surfaces may name. The sitemap and llms.txt read this one query.
 */
export async function publicTopicRows(): Promise<{ id: string; name: string; visibility: string; updatedAt: Date }[]> {
	return db
		.select({ id: topics.id, name: topics.name, visibility: topics.visibility, updatedAt: topics.updatedAt })
		.from(topics)
		.where(and(eq(topics.visibility, "public"), isShown))
}

// one docs or blog page as llms.txt links to it: where it lives, what it is called, and its own words
export type DiscoveryPage = { path: string; title: string; description: string; body: string }

/**
 * The docs pages read straight from their Markdown, in reading order: the intro and quickstart first,
 * then the rest by path.
 */
export function loadDocsPages(): DiscoveryPage[] {
	// every markdown file under the docs tree, one level of section directories deep
	const filePaths: string[] = []
	for (const entry of readdirSync(DOCS_ROOT, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith(".md")) {
			filePaths.push(entry.name)
		}
		// a section directory holds one more level of pages and nothing deeper
		if (entry.isDirectory()) {
			for (const nested of readdirSync(join(DOCS_ROOT, entry.name))) {
				if (nested.endsWith(".md")) {
					filePaths.push(`${entry.name}/${nested}`)
				}
			}
		}
	}

	// the entry points lead and everything else follows its path
	const toRank = (path: string): string => (path === "index.md" ? "0" : path === "quickstart.md" ? "1" : `2${path}`)
	const orderedPaths = filePaths.sort((first, second) => toRank(first).localeCompare(toRank(second)))
	return orderedPaths.flatMap((filePath) => {
		const page = toDocsPage(filePath)
		return page ? [page] : []
	})
}

// parse one docs file: the single-line title, the folded description, and the body past the frontmatter
function toDocsPage(filePath: string): DiscoveryPage | null {
	const source = readFileSync(join(DOCS_ROOT, filePath), "utf8")
	const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
	if (!match?.[1] || match[2] === undefined) {
		return null
	}
	// the frontmatter parses as yaml, which joins a folded description into one string
	const frontmatter = Bun.YAML.parse(match[1]) as { title?: unknown; description?: unknown; draft?: unknown }

	// a draft never ships in the built docs, and a page without a title has nothing to list
	if (frontmatter.draft === true || typeof frontmatter.title !== "string" || !frontmatter.title.trim()) {
		return null
	}
	const title = frontmatter.title.trim()
	const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : ""

	// index.md is the docs home, and every other page keeps its directory path with starlight's trailing slash
	const pagePath = filePath === "index.md" ? "/docs/" : `/docs/${filePath.replace(/\.md$/, "")}/`
	return { path: pagePath, title, description, body: match[2].trim() }
}

/**
 * The llms.txt convention: the product, one line on what it is, then sections of links a model can follow.
 */
export function toLlmsTxt(
	appUrl: string,
	docsPages: DiscoveryPage[],
	blogPages: { slug: string; title: string; description: string }[],
	topicRows: { id: string; name: string; visibility: string; updatedAt: Date }[],
): string {
	// the newest public topics under the limit
	const publicTopics = topicRows
		.filter((topicRow) => topicRow.visibility === "public")
		.sort((first, second) => second.updatedAt.getTime() - first.updatedAt.getTime())
		.slice(0, LLMS_TOPIC_LIMIT)

	// the sections in reading order: what this is, the manual, the writing, then what people read here
	const lines = [
		"# CarlNotes",
		"",
		"> CarlNotes reads your topics' sources on a schedule and writes ranked notes on what matters. Give Carl a topic, and he brews what you just missed.",
		"",
		"## About",
		"",
		`- [CarlNotes](${appUrl}): the app, and the topic feed it opens on`,
		`- [Plans](${appUrl}/plans): the free, plus, and premium tiers`,
		"",
		// the manual, page by page
		"## Docs",
		"",
		...docsPages.map((docsPage) => `- [${docsPage.title}](${appUrl}${docsPage.path}): ${docsPage.description}`),
		"",
		// the writing
		"## Blog",
		"",
		...blogPages.map((blogPage) => `- [${blogPage.title}](${appUrl}/blog/${blogPage.slug}): ${blogPage.description}`),
		"",
		// the newest public reading on the site
		"## Topics",
		"",
		...publicTopics.map((topicRow) => `- [${topicRow.name}](${appUrl}/topics/${topicRow.id})`),
	]
	return `${lines.join("\n")}\n`
}

/**
 * The long form: the full markdown text of the docs and blog, one document after another.
 */
export function toLlmsFullTxt(
	appUrl: string,
	docsPages: DiscoveryPage[],
	blogPages: { slug: string; title: string; body: string }[],
): string {
	// each document opens with its title and canonical url
	const documents = [
		...docsPages.map((docsPage) => `# ${docsPage.title}\n${appUrl}${docsPage.path}\n\n${docsPage.body}`),
		...blogPages.map((blogPage) => `# ${blogPage.title}\n${appUrl}/blog/${blogPage.slug}\n\n${blogPage.body.trim()}`),
	]
	return `${documents.join("\n\n---\n\n")}\n`
}

/**
 * The security.txt contact file, per RFC 9116: who to tell about a vulnerability, valid for the year ahead.
 */
export function toSecurityTxt(appUrl: string): string {
	// the expiry rolls forward on every request
	const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
	return [
		"Contact: mailto:support@carlnotes.com",
		`Expires: ${expiresAt.toISOString()}`,
		`Canonical: ${appUrl}/.well-known/security.txt`,
		"Preferred-Languages: en",
		"",
	].join("\n")
}

// one sitemap url element, with its last-modified date
function toSitemapEntry(url: string, lastModified?: Date): string {
	const lastmod = lastModified ? `<lastmod>${lastModified.toISOString()}</lastmod>` : ""
	return `<url><loc>${Bun.escapeHTML(url)}</loc>${lastmod}</url>`
}

/**
 * A JSON-LD script tag. The one escape that matters inside a script element is "<",
 * which would otherwise let a name like "</script>…" break out of the block.
 */
export function toJsonLdTag(data: object): string {
	return `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`
}

/**
 * The Organization schema for the homepage shell.
 */
export function toOrganizationLd(appUrl: string): object {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: "CarlNotes",
		url: appUrl,
		logo: `${appUrl}/carl-hero.png`,
		sameAs: ORGANIZATION_PROFILES,
	}
}

/**
 * The SoftwareApplication schema for the homepage shell, its offers are built from the pricing tiers.
 */
export function toSoftwareApplicationLd(appUrl: string): object {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "CarlNotes",
		url: appUrl,
		applicationCategory: "NewsApplication",
		operatingSystem: "Web",
		// one offer per plan, priced at its monthly rate
		offers: Object.entries(PLANS).map(([plan, planConfig]) => ({
			"@type": "Offer",
			name: `${plan[0]?.toUpperCase()}${plan.slice(1)}`,
			price: (planConfig.priceMonthlyCents / 100).toFixed(2),
			priceCurrency: "USD",
		})),
	}
}

/**
 * The CreativeWork schema for a public Topic's page, dated to its last succeeded Scan.
 * The author and publisher fields say this is a user's work hosted on CarlNotes, not the site describing itself.
 */
export function toCreativeWorkLd(work: {
	name: string
	description: string
	url: string
	dateModified: Date | null
	authorUsername: string | null
	// the last Scan's Findings as a ranked ItemList, or null if there is none to list
	findingList: object | null
	appUrl: string
}): object {
	return {
		"@context": "https://schema.org",
		"@type": "CreativeWork",
		name: work.name,
		description: work.description,
		url: work.url,
		...(work.dateModified ? { dateModified: work.dateModified.toISOString() } : {}),
		...(work.authorUsername ? { author: { "@type": "Person", name: work.authorUsername } } : {}),
		...(work.findingList ? { hasPart: work.findingList } : {}),
		publisher: { "@type": "Organization", name: "CarlNotes", url: work.appUrl },
		isPartOf: { "@type": "WebSite", name: "CarlNotes", url: work.appUrl },
	}
}

/**
 * The Topic's last succeeded Scan, or null before its first.
 * It dates the page's CreativeWork and names the Scan whose Findings the hasPart list includes.
 */
export async function lastScan(topicId: string): Promise<{ id: string; startedAt: Date } | null> {
	// use the newest succeeded scan for this topic
	const [row] = await db
		.select({ id: scans.id, startedAt: scans.startedAt })
		.from(scans)
		.where(and(eq(scans.topicId, topicId), eq(scans.status, "succeeded")))
		.orderBy(desc(scans.startedAt))
		.limit(1)
	return row ?? null
}

// one finding as the scan email shows it: the resource's title and link, and the relevance explanation
export type ScanFinding = { title: string | null; url: string; relevanceExplanation: string }

/**
 * A Scan's Findings joined to their Resources, ranked by relevance: the same rows the scan email renders.
 * The topic page's structured data and its noscript body both are built from these.
 */
export async function scanFindings(scanId: string): Promise<ScanFinding[]> {
	// ranked by relevance like the email and the feed's default sort
	return db
		.select({ title: resources.title, url: resources.url, relevanceExplanation: findings.relevanceExplanation })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.scanId, scanId))
		.orderBy(desc(findings.relevanceScore))
}

/**
 * The Findings as a schema.org ItemList for the CreativeWork's hasPart: rank, title, link, and relevance explanation.
 * Null if the Scan kept nothing.
 */
export function toFindingListLd(findingRows: ScanFinding[]): object | null {
	// a scan that kept nothing adds no list
	if (findingRows.length === 0) {
		return null
	}

	// one ListItem per finding. an untitled resource is named by its url, the email's own fallback
	return {
		"@type": "ItemList",
		name: `Carl's Top ${findingRows.length}`,
		itemListElement: findingRows.map((findingRow, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: findingRow.title ?? findingRow.url,
			url: findingRow.url,
			description: findingRow.relevanceExplanation,
		})),
	}
}

/**
 * The Findings as a noscript section for the topic page's body: the ranked list the scan email shows.
 * A crawler that runs no JavaScript reads this where it would otherwise find an empty SPA shell.
 * A browser renders the SPA instead, so people don't see it.
 */
export function toFindingListHtml(topicName: string, description: string, findingRows: ScanFinding[]): string {
	// one linked line per finding, the email's own content. an untitled resource is named by its url
	const items = findingRows
		.map(
			(row) =>
				`<li><a href="${Bun.escapeHTML(row.url)}">${Bun.escapeHTML(row.title ?? row.url)}</a> — ${Bun.escapeHTML(row.relevanceExplanation)}</li>`,
		)
		.join("")
	// the list and its heading only render when the scan kept something
	const findingList = items ? `<h2>Carl's Top ${findingRows.length}</h2><ol>${items}</ol>` : ""
	return `<noscript><section><h1>${Bun.escapeHTML(topicName)}</h1><p>${Bun.escapeHTML(description)}</p>${findingList}</section></noscript>`
}
