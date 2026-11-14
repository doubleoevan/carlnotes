// the mark on an unchecked image's api path, one query parameter. an image is shown to its uploader alone until its
// image moderation can run. the avatar routes return the unchecked upload or not found for a marked path, and the
// mobile app sends the session cookie with a marked path alone

// the query parameter that marks an unchecked image's path, with the value 1
export const UNCHECKED_IMAGE_QUERY_PARAMETER = "unchecked"

/**
 * Returns an api image path marked as an unchecked image's: the same path with unchecked=1 in its query.
 */
export function toUncheckedImagePath(imagePath: string): string {
	const separator = imagePath.includes("?") ? "&" : "?"
	return `${imagePath}${separator}${UNCHECKED_IMAGE_QUERY_PARAMETER}=1`
}

/**
 * Returns whether a value is an unchecked image's path: a relative path on the api whose parsed query has unchecked
 * equal to 1. An absolute url, a path outside the api, and an unchecked=1 inside another parameter's value are not one.
 */
export function isUncheckedImagePath(value: string): boolean {
	// only a relative api path that names the mark at all is an unchecked image's. a url that names a host never is,
	// and almost no path names the mark, so its query is parsed only if it does
	if (!value.startsWith("/api/") || !value.includes(`${UNCHECKED_IMAGE_QUERY_PARAMETER}=1`)) {
		return false
	}

	// read the query's own unchecked parameter, without the fragment and apart from every other parameter's value
	const [pathAndQuery = ""] = value.split("#")
	const queryStart = pathAndQuery.indexOf("?")
	const query = queryStart === -1 ? "" : pathAndQuery.slice(queryStart + 1)
	return new URLSearchParams(query).get(UNCHECKED_IMAGE_QUERY_PARAMETER) === "1"
}
