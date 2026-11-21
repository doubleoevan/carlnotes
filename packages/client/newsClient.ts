// the api client for the news: the signed-in user's own, and a profile's as its reader may see it
import { type NewsResponse, type NewsWindow, newsResponse } from "@carlnotes/contracts/news"
import type { ProfileAudience } from "@carlnotes/contracts/profiles"
import { apiClient, readApiResponse } from "./apiClient"

// the window and the page to read, and the cursor an earlier page of the window returned
type NewsPageQuery = { window: NewsWindow; page: number; cursor?: string }

// what runs after each of the signed-in user's own writes that their news shows
const newsWriteListeners = new Set<() => void>()

/**
 * Adds what runs after each of the user's own writes that their news shows: a Comment, a reaction, a Topic Post's
 * publish or delete, and a follow or unfollow. Returns the function that removes it.
 */
export function addNewsWriteListener(listener: () => void): () => void {
	newsWriteListeners.add(listener)
	return () => {
		newsWriteListeners.delete(listener)
	}
}

/**
 * Runs every news write listener, after one of the user's own writes that their news shows.
 */
export function notifyNewsWrite(): void {
	for (const listener of newsWriteListeners) {
		listener()
	}
}

/**
 * Fetches one page of the signed-in user's own news. A failed read throws an error.
 */
export async function fetchNews(query: NewsPageQuery): Promise<NewsResponse> {
	const response = await apiClient().api.news.$get({ query: toNewsQuery(query) })
	if (!response.ok) {
		throw new Error(`news read failed: ${response.status}`)
	}
	return readApiResponse(newsResponse, response)
}

/**
 * Fetches one page of a profile's news. The person and an admin read it whole, and anyone else, or the visitor audience,
 * its public rows. A failed read throws an error.
 */
export async function fetchProfileNews(
	profileUserId: string,
	{ audience, ...query }: NewsPageQuery & { audience?: ProfileAudience },
): Promise<NewsResponse> {
	const response = await apiClient().api.profiles[":userId"].news.$get({
		param: { userId: profileUserId },
		query: { ...toNewsQuery(query), audience },
	})
	if (!response.ok) {
		throw new Error(`profile news read failed: ${response.status}`)
	}
	return readApiResponse(newsResponse, response)
}

// a page's query as the url holds it, with the page number as text
function toNewsQuery({ window, page, cursor }: NewsPageQuery): { window: NewsWindow; page: string; cursor?: string } {
	return { window, page: String(page), cursor }
}
