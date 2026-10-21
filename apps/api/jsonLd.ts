// the JSON-LD structured data: the script tag, a public topic's CreativeWork, and the last scan's findings as the
// CreativeWork's ItemList
import { toJsonLdText } from "@carlnotes/contracts/seo"
import { db, isFindingShown } from "@carlnotes/db"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { and, desc, eq } from "drizzle-orm"

/**
 * A JSON-LD script tag. The one escape that matters inside a script element is "<",
 * which would otherwise let a name like "</script>…" break out of the block.
 */
export function toJsonLdTag(data: object): string {
	return `<script type="application/ld+json">${toJsonLdText(data)}</script>`
}

/**
 * The CreativeWork schema for a public Topic's page.
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
 */
export async function lastScan(topicId: string): Promise<{ id: string } | null> {
	// use the newest succeeded scan for this topic
	const [scanRow] = await db
		.select({ id: scans.id })
		.from(scans)
		.where(and(eq(scans.topicId, topicId), eq(scans.status, "succeeded")))
		.orderBy(desc(scans.startedAt))
		.limit(1)
	return scanRow ?? null
}

// one finding as the scan email shows it: the resource's title and link, and the relevance explanation
export type ScanFinding = { title: string | null; url: string; relevanceExplanation: string }

/**
 * A Scan's Findings joined to their Resources, ranked by relevance: the same rows the scan email renders.
 */
export async function scanFindings(scanId: string): Promise<ScanFinding[]> {
	// ranked by relevance like the email and the feed's default sort
	return db
		.select({ title: resources.title, url: resources.url, relevanceExplanation: findings.relevanceExplanation })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(and(eq(findings.scanId, scanId), isFindingShown))
		.orderBy(desc(findings.relevanceScore))
}

/**
 * Returns the Findings as a schema.org ItemList for the CreativeWork's hasPart:
 * rank, title, link, and the relevance explanation if a Finding has one.
 * Returns null if the Scan kept nothing.
 */
export function toFindingListLd(findingRows: ScanFinding[]): object | null {
	// a scan that kept nothing adds no list
	if (findingRows.length === 0) {
		return null
	}

	// one ListItem per finding. an untitled resource is named by its url, the email's own fallback,
	// and a finding without a relevance explanation has no description
	return {
		"@type": "ItemList",
		name: `Carl's Top ${findingRows.length}`,
		itemListElement: findingRows.map((findingRow, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: findingRow.title ?? findingRow.url,
			url: findingRow.url,
			...(findingRow.relevanceExplanation ? { description: findingRow.relevanceExplanation } : {}),
		})),
	}
}
