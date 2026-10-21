// the page head contract: what an HTML page's head renders

// what an HTML page's head renders
export type PageHead = {
	title: string
	// the title the link-preview card shows
	cardTitle: string
	description: string
	// null for a page that is not indexed, like an invitation or a team with no public topic
	canonicalUrl: string | null
	// the url the link-preview card points at. the page's own url, or the invite url on the join page
	cardUrl: string
	imageUrl: string
	// the page's rss feed, for a public topic, and null for every other page
	feedUrl: string | null
	// a public topic's podcast feed once the topic has an episode
	podcastFeedUrl?: string | null
	isIndexed: boolean
	jsonLd: object | null
}
