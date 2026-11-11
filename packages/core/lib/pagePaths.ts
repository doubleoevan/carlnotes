// whether a link's path is the page that is open, for a link that opens nothing on its own page

/**
 * Returns whether a link's path is the open page's path, compared without the query, the hash, and the end slash.
 */
export function isCurrentPagePath({ path, currentPath }: { path: string; currentPath: string }): boolean {
	return toPagePathname(path) === toPagePathname(currentPath)
}

// a path without its query, its hash, and its end slash
function toPagePathname(path: string): string {
	const pathname = path.split(/[?#]/, 1)[0] ?? path
	return pathname.replace(/\/+$/, "") || "/"
}
