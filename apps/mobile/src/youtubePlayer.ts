// the iframe host used by the pinned mobile YouTube player
export const YOUTUBE_PLAYER_BASE_URL = "https://lonelycpp.github.io/react-native-youtube-iframe/iframe.html"

/**
 * Keeps player navigation inside its frame and rejects links that could launch another app.
 */
export function shouldLoadYoutubePlayerUrl(href: string): boolean {
	if (href === "about:blank") {
		return true
	}
	try {
		// allow the player document and YouTube's embedded frame, including their query parameters
		const url = new URL(href)
		if (url.protocol !== "https:" || url.username || url.password || url.port) {
			return false
		}
		if (url.origin + url.pathname === YOUTUBE_PLAYER_BASE_URL) {
			return true
		}
		return (
			(url.hostname === "www.youtube.com" || url.hostname === "www.youtube-nocookie.com") &&
			url.pathname.startsWith("/embed/")
		)
	} catch {
		return false
	}
}
