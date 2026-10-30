// the site's own host and origin in production. this module imports nothing. the app's config loads it under Node,
// which resolves no extensionless relative import

export const SITE_HOST = "carlnotes.com"
export const SITE_URL = `https://${SITE_HOST}`

/**
 * Returns true for the site's own url: the origin itself, or a path after it.
 */
export function isSiteUrl(href: string): boolean {
	return href === SITE_URL || href.startsWith(`${SITE_URL}/`)
}
