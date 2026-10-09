// the seo files and the public topic queries they read. the files are the sitemap, llms.txt, llms-full.txt,
// security.txt, and the JSON-LD structured data
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import type { PublicTopic } from "@shared/contracts"
import { PODCAST_SHOW_NAME } from "@shared/podcastEpisodes"
import { toJsonLdText, toMetaDescription, toTopicPath } from "@shared/seo"
import { and, desc, eq, exists, inArray, or, type SQL, sql } from "drizzle-orm"
import { db, isFindingShown } from "../db"
import { findings, resources, scans, teams, teamTopics, topics } from "../db/schema"
import {
	loadPublicPodcastEpisodeRows,
	type PublicPodcastEpisodeRow,
	toPublicPodcastEpisodePages,
} from "./podcast/podcastSeo"
import { loadReleases, toReleasePath } from "./releases"
import { isPublicAndShown } from "./topic/permissions"
import { cacheForTtl } from "./ttlCache"

// the pages the sitemap always lists
const STATIC_ROUTES = ["/", "/plans", "/terms", "/privacy"]

// how many topics llms.txt lists, and how many podcast episodes
const LLMS_TOPIC_LIMIT = 50
const LLMS_PODCAST_EPISODE_LIMIT = 50

// where the docs markdown lives, resolved from this file so the api reads it from any working directory
const DOCS_ROOT = join(import.meta.dir, "..", "docs", "src", "content", "docs")

// how long the parsed docs pages are kept before a read lists and parses their files again
const DOCS_PAGES_TTL_MS = 60_000

/**
 * The sitemap, built from live data on each request: the static routes, the blog pages, and every public Topic.
 * Profile pages are too thin to promote to a crawler, and a team is listed only once it has a public topic.
 * The docs are absent because they are statically built files instead of anything this route can read, and the docs site emits its own sitemap.
 */
export async function toSitemapXml(appUrl: string, blogPaths: string[] = []): Promise<string> {
	// the public topics, each one added to the sitemap as its own page
	const publicTopics = await loadPublicTopics()

	// the public teams with a public topic to list, each with its own page
	const teamRows = await db
		.select({ id: teams.id })
		.from(teams)
		.where(
			and(
				eq(teams.isPublic, true),
				exists(db.select({ id: topics.id }).from(topics).where(toTeamPublicTopicsFilter(teams.id))),
			),
		)

	// the published podcast episodes of those topics, each with its own page
	const publicPodcastEpisodeRows = await loadPublicPodcastEpisodeRows(publicTopics.map((publicTopic) => publicTopic.id))
	const publicPodcastEpisodePages = toPublicPodcastEpisodePages({ appUrl, publicTopics, publicPodcastEpisodeRows })

	// the releases index and every published release's own page, each release dated by when it went out
	const releaseRows = await loadReleases()

	// one entry per url. topics have a lastmod, the rest are plain locations
	const entries = [
		...STATIC_ROUTES.map((path) => toSitemapEntry(`${appUrl}${path === "/" ? "" : path}`)),
		...blogPaths.map((path) => toSitemapEntry(`${appUrl}${path}`)),
		...publicTopics.map((publicTopic) =>
			toSitemapEntry(`${appUrl}${toTopicPath(publicTopic)}`, new Date(publicTopic.feedUpdatedAt)),
		),
		// a podcast episode's page, dated by when the podcast episode published
		...publicPodcastEpisodePages.map((podcastEpisodePage) =>
			toSitemapEntry(podcastEpisodePage.url, podcastEpisodePage.publishedAt ?? undefined),
		),
		...teamRows.map((teamRow) => toSitemapEntry(`${appUrl}/teams/${teamRow.id}`)),
		toSitemapEntry(`${appUrl}/releases`),
		...releaseRows.map((release) => toSitemapEntry(`${appUrl}${toReleasePath(release.tag)}`, release.releasedAt)),
	]
	return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`
}

/**
 * Every public Topic with enough findings to show, most recently changed first.
 */
export async function loadPublicTopics(): Promise<PublicTopic[]> {
	// read the shown public topics, most recently changed first
	const topicRows = await db
		.select(publicTopicColumns)
		.from(topics)
		.where(isPublicAndShown)
		.orderBy(desc(topics.updatedAt))

	// shape each row as the PublicTopic contract, with its description written and feedUpdatedAt as an ISO string
	return topicRows.map((topicRow) => ({
		id: topicRow.id,
		name: topicRow.name,
		description: toTopicDescription(topicRow),
		feedUpdatedAt: topicRow.feedUpdatedAt.toISOString(),
	}))
}

// the summary of the newest succeeded scan that kept a finding, as a subquery on a topic row. drizzle drops the
// table name from a top-level column in a one-table select, so each subquery nests in an outer sql fragment
const lastScanSummaryQuery = sql`(select ${scans.scanSummary} from ${scans} where ${scans.topicId} = ${topics.id} and ${scans.status} = 'succeeded' and ${scans.keptCount} > 0 and ${scans.scanSummary} <> '' order by ${scans.startedAt} desc limit 1)`
export const lastScanSummary = sql<string | null>`${lastScanSummaryQuery}`

// when a topic's feed last gained a finding, or the topic's creation time if it has none
const newestFindingCreatedAtQuery = sql`(select max(${findings.createdAt}) from ${findings} where ${findings.topicId} = ${topics.id})`
export const topicFeedUpdatedAt = sql<Date>`coalesce(${newestFindingCreatedAtQuery}, ${topics.createdAt})`.mapWith(
	topics.createdAt,
)

// the columns of a public topic row. the prompt and the scan summary are what its description is written from
const publicTopicColumns = {
	id: topics.id,
	name: topics.name,
	prompt: topics.prompt,
	feedUpdatedAt: topicFeedUpdatedAt,
	scanSummary: lastScanSummary,
}

/**
 * Returns a topic's description from its last scan's summary, else its prompt, else its name.
 */
export function toTopicDescription(topicRow: { name: string; prompt: string; scanSummary: string | null }): string {
	return toMetaDescription(topicRow.scanSummary || topicRow.prompt || topicRow.name)
}

// one docs or blog page as llms.txt links to it: where it lives, what it is called, and its own words
export type DiscoveryPage = { path: string; title: string; description: string; body: string }

/**
 * Returns the docs pages read from their Markdown, in reading order: the intro and quickstart first, then the rest by path.
 * The files are read again once the kept pages are a minute old.
 */
export const loadDocsPages = cacheForTtl(readDocsPages, DOCS_PAGES_TTL_MS)

// read every docs page from its file, in reading order
async function readDocsPages(): Promise<DiscoveryPage[]> {
	// every markdown file under the docs tree, one level of section directories deep
	const filePaths: string[] = []
	for (const entry of await readdir(DOCS_ROOT, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith(".md")) {
			filePaths.push(entry.name)
		}
		// a section directory contains one more level of pages and nothing deeper
		if (entry.isDirectory()) {
			for (const nested of await readdir(join(DOCS_ROOT, entry.name))) {
				if (nested.endsWith(".md")) {
					filePaths.push(`${entry.name}/${nested}`)
				}
			}
		}
	}

	// the entry points lead and everything else follows its path
	const toRank = (path: string): string => (path === "index.md" ? "0" : path === "quickstart.md" ? "1" : `2${path}`)
	const orderedPaths = filePaths.sort((first, second) => toRank(first).localeCompare(toRank(second)))
	const docsPages = await Promise.all(
		orderedPaths.map(async (filePath) => toDocsPage(filePath, await Bun.file(join(DOCS_ROOT, filePath)).text())),
	)
	return docsPages.filter((docsPage) => docsPage !== null)
}

// parse one docs file's Markdown: the single-line title, the folded description, and the body past the frontmatter
function toDocsPage(filePath: string, markdown: string): DiscoveryPage | null {
	const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
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

// what llms.txt is built from. the public topics' podcast episodes come newest first
type ToLlmsTxtOptions = {
	appUrl: string
	docsPages: DiscoveryPage[]
	blogPages: { slug: string; title: string; description: string }[]
	publicTopics: PublicTopic[]
	publicPodcastEpisodeRows: PublicPodcastEpisodeRow[]
}

/**
 * The llms.txt convention: the product, one line on what it is, then sections of links a model can follow.
 */
export function toLlmsTxt({
	appUrl,
	docsPages,
	blogPages,
	publicTopics,
	publicPodcastEpisodeRows,
}: ToLlmsTxtOptions): string {
	// the first public topics under the limit, most recently changed first
	const listedPublicTopics = publicTopics.slice(0, LLMS_TOPIC_LIMIT)

	// the newest podcast episodes under the limit, each line linking the title to the podcast episode's page
	const podcastEpisodeLines = toPublicPodcastEpisodePages({
		appUrl,
		publicTopics,
		publicPodcastEpisodeRows: publicPodcastEpisodeRows.slice(0, LLMS_PODCAST_EPISODE_LIMIT),
	}).map(({ url, title, description }) => `- [${title}](${url}): ${description}`)

	// the podcast section, which a site with no published episode leaves out
	const podcastSection =
		podcastEpisodeLines.length > 0 ? ["", `## ${PODCAST_SHOW_NAME}`, "", ...podcastEpisodeLines] : []

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
		...listedPublicTopics.map((publicTopic) => `- [${publicTopic.name}](${appUrl}${toTopicPath(publicTopic)})`),
		// the newest podcast episodes of the public topics
		...podcastSection,
	]
	return `${lines.join("\n")}\n`
}

// what llms-full.txt is built from: the site's origin and the docs and blog pages whose text it includes
type ToLlmsFullTxtOptions = {
	appUrl: string
	docsPages: DiscoveryPage[]
	blogPages: { slug: string; title: string; body: string }[]
}

/**
 * The long form: the full markdown text of the docs and blog, one document after another.
 */
export function toLlmsFullTxt({ appUrl, docsPages, blogPages }: ToLlmsFullTxtOptions): string {
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

/**
 * Filters to the public topics a team owns or that are shared with it.
 */
export function toTeamPublicTopicsFilter(teamId: string | typeof teams.id): SQL | undefined {
	return and(
		eq(topics.visibility, "public"),
		or(
			eq(topics.teamId, teamId),
			inArray(
				topics.id,
				db.select({ topicId: teamTopics.topicId }).from(teamTopics).where(eq(teamTopics.teamId, teamId)),
			),
		),
	)
}

/**
 * Loads when a topic's feed last gained a finding, or the topic's creation time if it has none.
 */
export async function loadTopicFeedUpdatedAt(topicId: string): Promise<Date | null> {
	// read the topic's newest finding time, or its creation time if it has none
	const [topicRow] = await db.select({ feedUpdatedAt: topicFeedUpdatedAt }).from(topics).where(eq(topics.id, topicId))
	return topicRow?.feedUpdatedAt ?? null
}
