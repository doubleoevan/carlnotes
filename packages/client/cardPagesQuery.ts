/**
 * Returns a zero-based page as a query value, left out for the first page, which a paged read holds by default.
 */
export function toPageQuery(page: number | undefined): string | undefined {
	return page ? String(page) : undefined
}

/**
 * Returns the query that a paged read sends for one zero-based page of Topic Posts, or empty for a read that is not
 * paged.
 */
export function toTopicPostsPagedQuery({
	isPaged,
	topicPostsPage,
}: {
	isPaged: boolean
	topicPostsPage: number | undefined
}): { paged?: "1"; topicPostsPage?: string } {
	return isPaged ? { paged: "1", topicPostsPage: toPageQuery(topicPostsPage) } : {}
}
