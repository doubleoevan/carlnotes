// the page head contract: what an HTML page's head renders
import { z } from "zod"

// what an HTML page's head renders
export const pageHead = z.object({
	title: z.string(),
	// the title the link-preview card shows
	cardTitle: z.string(),
	description: z.string(),
	// null for a page that is not indexed, like an invitation or a team with no public topic
	canonicalUrl: z.string().nullable(),
	// the url the link-preview card points at. the page's own url, or the invite url on the join page
	cardUrl: z.string(),
	imageUrl: z.string(),
	// the page's rss feed, for a public topic, and null for every other page
	feedUrl: z.string().nullable(),
	// a public topic's podcast feed once the topic has an episode
	podcastFeedUrl: z.string().nullable().optional(),
	isIndexed: z.boolean(),
	// the page's structured data: one schema.org object, a list of them, or null for none
	jsonLd: z.custom<object>((jsonLd) => typeof jsonLd === "object" && jsonLd !== null).nullable(),
})

export type PageHead = z.infer<typeof pageHead>
