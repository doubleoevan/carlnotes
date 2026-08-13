// the seo surfaces behind the shell routes: the live sitemap and the JSON-LD structured data
import { PLANS } from "@shared/plans"
import { and, desc, eq } from "drizzle-orm"
import { db } from "../db"
import { findings, resources, scans, topics } from "../db/schema"
import { isShown } from "./topic/permissions"

// the SPA routes the sitemap always lists
const STATIC_ROUTES = ["/", "/plans", "/terms", "/privacy"]

// the official CarlNotes accounts, which tell a search engine that this site and its social profiles are one organization.
const ORGANIZATION_PROFILES = [
	"https://x.com/notesofcarl",
	"https://bsky.app/profile/notesofcarl.bsky.social",
	"https://www.reddit.com/user/notesofcarl/",
]

/**
 * The sitemap, built from live data on each request: the static routes, the blog pages, the docs pages, and every public Topic.
 * Profile pages keep their canonical url and preview card but are too thin to promote to a crawler.
 */
export async function toSitemapXml(appUrl: string, blogPaths: string[] = []): Promise<string> {
	// the public topics, each one added to the sitemap as its own page
	const topicRows = await db
		.select({ id: topics.id, updatedAt: topics.updatedAt })
		.from(topics)
		.where(and(eq(topics.visibility, "public"), isShown))

	// one entry per url. topics carry a lastmod, the rest are plain locations
	const entries = [
		...STATIC_ROUTES.map((path) => toSitemapEntry(`${appUrl}${path === "/" ? "" : path}`)),
		...blogPaths.map((path) => toSitemapEntry(`${appUrl}${path}`)),
		...topicRows.map((row) => toSitemapEntry(`${appUrl}/topics/${row.id}`, row.updatedAt)),
	]
	return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`
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
	// the last Scan's Findings as a ranked ItemList, or null when there is none to list
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
 * It dates the page's CreativeWork and names the Scan whose Findings the hasPart list carries.
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

// one finding as the scan email carries it: the resource's title and link, and the relevance explanation
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
 * Null when the Scan kept nothing.
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
		itemListElement: findingRows.map((row, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: row.title ?? row.url,
			url: row.url,
			description: row.relevanceExplanation,
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
