// the first page of the week's news that a page read holds, null if its own read fails
import { DEFAULT_NEWS_WINDOW, type NewsResponse, type NewsWindow } from "@carlnotes/contracts/news"
import { reportError } from "@carlnotes/server/monitoring"
import { readCachedNews } from "./news/newsCaches"

// whose news it is, who reads it, null for a visitor, and the window, the default one if none is named
type ReadPageReadNewsOptions = { profileUserId: string; userId: string | null; window?: NewsWindow }

/**
 * Returns the first page of a person's news in the window, the default one if none is named, through the news caches,
 * or null if the read fails, so the page read that holds it still returns the rest.
 */
export async function readPageReadNews({
	profileUserId,
	userId,
	window = DEFAULT_NEWS_WINDOW,
}: ReadPageReadNewsOptions): Promise<NewsResponse | null> {
	// the first page through the news caches, or null with the failure logged and reported
	try {
		return await readCachedNews({ profileUserId, userId, window, page: 1 })
	} catch (error) {
		console.error(`could not read the news of ${profileUserId} for a page read`, error)
		reportError(error, "api-route", { userId: userId ?? "visitor" })
		return null
	}
}
