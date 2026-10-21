// the like pattern that the name and text searches match a lowercased column with

/**
 * Returns a like pattern that matches a lowercased column containing the query, its typed characters matched literally,
 * never as wildcards.
 */
export function toContainsLikePattern(query: string): string {
	return `%${escapeLikePattern(query.toLowerCase())}%`
}

// the query with each like wildcard and the escape character itself escaped
function escapeLikePattern(query: string): string {
	return query.replaceAll(/[\\%_]/g, (wildcard) => `\\${wildcard}`)
}
