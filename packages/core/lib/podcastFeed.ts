// preserve the web's app scheme and label on each supported phone platform
const PODCAST_APP_LINKS = {
	ios: { scheme: "podcast://", label: "Open in Apple Podcasts" },
	android: { scheme: "pcast://", label: "Open in your podcast app" },
}

/**
 * Returns a supported podcast-app link without changing the feed's path, query, or token.
 */
export function toPodcastAppLink({
	platform,
	feedUrl,
}: {
	platform: string
	feedUrl: string
}): { url: string; label: string } | null {
	const link = platform === "ios" || platform === "android" ? PODCAST_APP_LINKS[platform] : null
	if (!link || !/^https?:\/\//.test(feedUrl)) {
		return null
	}
	return { url: `${link.scheme}${feedUrl.replace(/^https?:\/\//, "")}`, label: link.label }
}

export const PODCAST_FEED_RESET_TITLE = "Reset your podcast link?"
export const PODCAST_FEED_RESET_DESCRIPTION =
	"Your old link will stop working. Add the new link to your podcast app to keep getting episodes."
