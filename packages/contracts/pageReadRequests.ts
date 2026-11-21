// each page's server load: the api requests its route loader sends, one page read each, by their path patterns
export const PAGE_READ_REQUESTS = {
	profile: ["/api/profiles/:userId/page"],
	team: ["/api/teams/:id/page"],
	home: ["/api/home"],
	topic: ["/api/topics/:id/page"],
	podcastEpisode: ["/api/topics/:id/episodes/:season/:episodeNumber/page"],
	topicPost: ["/api/topic-posts/:id/page"],
	dashboard: ["/api/dashboards/:dashboardKind/:subjectId/page"],
} as const satisfies Record<string, readonly string[]>

// a page that loads through its page read
export type PageReadKind = keyof typeof PAGE_READ_REQUESTS

/**
 * Returns the paths of a page's server load requests with their params filled in. A param the given ones leave out
 * stays its pattern.
 */
export function toPageReadRequestPaths(pageReadKind: PageReadKind, params: Record<string, string> = {}): string[] {
	return PAGE_READ_REQUESTS[pageReadKind].map((requestPath) =>
		requestPath.replace(/:(\w+)/g, (pattern, paramName: string) => params[paramName] ?? pattern),
	)
}
