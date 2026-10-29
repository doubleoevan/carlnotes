import { toPodcastAppLink } from "@carlnotes/core/lib/podcastFeed"

type PodcastAppAdapter = {
	canOpenURL: (url: string) => Promise<boolean>
	openURL: (url: string) => Promise<unknown>
}

/**
 * Opens a feed only through the selected platform's podcast scheme, without exposing failures containing its token.
 */
export async function openPodcastFeed({
	feedUrl,
	platform,
	adapter,
	isCurrent,
}: {
	feedUrl: string
	platform: string
	adapter: PodcastAppAdapter
	isCurrent: () => boolean
}): Promise<string | null> {
	const link = toPodcastAppLink({ platform, feedUrl })
	if (!link || !isCurrent()) {
		return null
	}
	try {
		const canOpen = await adapter.canOpenURL(link.url)
		if (!isCurrent()) {
			return null
		}
		if (!canOpen) {
			return "No podcast app could open this link. Copy the feed link instead."
		}
		await adapter.openURL(link.url)
		return null
	} catch {
		return "The podcast app did not open. Copy the feed link instead."
	}
}
