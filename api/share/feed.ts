// a public Topic's RSS feed: the Findings Carl kept, in the format a reader app understands
import { desc, eq } from "drizzle-orm"
import { db } from "../../db"
import { findings, resources, topics, users } from "../../db/schema"

// how many Findings a feed carries. a feed reader wants the recent ones, and an unbounded feed grows forever
const FEED_ITEM_LIMIT = 50

// what an entry in the feed says
export type FeedItem = { title: string; url: string; explanation: string | null; publishedAt: Date }

/**
 * A public Topic's feed as RSS or null if the Topic is not public.
 */
export async function toTopicFeedXml(topicId: string, appUrl: string): Promise<string | null> {
	const [topic] = await db
		.select({
			id: topics.id,
			name: topics.name,
			prompt: topics.prompt,
			visibility: topics.visibility,
			owner: users.username,
		})
		.from(topics)
		.innerJoin(users, eq(users.id, topics.ownerId))
		.where(eq(topics.id, topicId))
	// return nothing if the Topic is not public. one with no findings still gets a feed, so a user can subscribe now
	if (topic?.visibility !== "public") {
		return null
	}

	// the kept Findings, newest first
	const findingRows = await db
		.select({
			title: resources.title,
			url: resources.url,
			explanation: findings.relevanceExplanation,
			publishedAt: resources.createdAt,
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.topicId, topicId))
		.orderBy(desc(resources.createdAt))
		.limit(FEED_ITEM_LIMIT)

	const topicUrl = `${appUrl}/topics/${topic.id}`
	const topicOwner = topic.owner ? ` Brewed by ${topic.owner}.` : ""
	return toRssXml({
		title: `${topic.name} · CarlNotes`,
		description: `${topic.prompt || "What Carl found for this topic."}${topicOwner}`,
		linkUrl: topicUrl,
		feedUrl: `${topicUrl}/feed.xml`,
		items: findingRows.map((findingRow) => ({ ...findingRow, title: findingRow.title ?? findingRow.url })),
	})
}

/**
 * The site-wide feed of whatever feed items it is handed, newest first.
 */
export function toSiteFeedXml(appUrl: string, feedItems: FeedItem[]): string {
	// newest first across every section it is handed
	const orderedItems = [...feedItems].sort(
		(first, second) => second.publishedAt.getTime() - first.publishedAt.getTime(),
	)
	return toRssXml({
		title: "CarlNotes",
		description: "Notes of Carl: the blog, and what ships.",
		linkUrl: appUrl,
		feedUrl: `${appUrl}/feed.xml`,
		items: orderedItems,
	})
}

// the feed document. every value the Topic or its Findings supply is user or web-sourced, so all of it is escaped
function toRssXml(feed: {
	title: string
	description: string
	linkUrl: string
	feedUrl: string
	items: FeedItem[]
}): string {
	// what the RSS reader shows about the channel
	const channel = [
		`<title>${toXmlText(feed.title)}</title>`,
		`<link>${toXmlText(feed.linkUrl)}</link>`,
		`<description>${toXmlText(feed.description)}</description>`,
		`<atom:link href="${toXmlText(feed.feedUrl)}" rel="self" type="application/rss+xml"/>`,
	].join("\n")

	// the entries, then the document around both
	const feedItems = feed.items.map((feedItem) => toRssItem(feedItem)).join("")
	const openingTags = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>`
	return `${openingTags}\n${channel}\n${feedItems}</channel>\n</rss>`
}

// one entry. the url is the guid, which globally deduplicates a Resource
function toRssItem(item: FeedItem): string {
	// the relevance explanation is the description when there is one
	const tags = [
		`<title>${toXmlText(item.title)}</title>`,
		`<link>${toXmlText(item.url)}</link>`,
		`<guid isPermaLink="true">${toXmlText(item.url)}</guid>`,
		`<pubDate>${item.publishedAt.toUTCString()}</pubDate>`,
		item.explanation ? `<description>${toXmlText(item.explanation)}</description>` : "",
	].filter(Boolean)
	return `<item>\n${tags.join("\n")}\n</item>\n`
}

// xml 1.0 rejects most control characters even escaped, so they are dropped before escaping
function toXmlText(text: string): string {
	const kept = [...text].filter((character) => {
		const code = character.charCodeAt(0)
		return code === 0x9 || code === 0xa || code === 0xd || code >= 0x20
	})
	return Bun.escapeHTML(kept.join(""))
}
