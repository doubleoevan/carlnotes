// the caches of a news window's first page: a profile's that every visitor shares, and a person's own, which their own
// writes clear

import { type NewsResponse, type NewsWindow, newsWindows } from "@carlnotes/contracts/news"
import { cacheJson, deleteRedisKeys } from "@carlnotes/db/redis"
import { type ReadNewsOptions, readNews } from "./readNews"

// how long a cached first page lasts
const NEWS_FIRST_PAGE_TTL_MS = 60_000

/**
 * Reads one page of a person's news through the first page's caches. A visitor's first page of a profile's window is
 * shared by every visitor, and a person's own first page of a window is theirs alone. A signed-in read of someone
 * else's news, a later page, a read with a cursor, and a read of another page size are read each time.
 */
export function readCachedNews(newsRead: ReadNewsOptions): Promise<NewsResponse | null> {
	// only a window's first page of the usual size is cached
	const { profileUserId, userId, window, page, cursor, pageSize } = newsRead
	const loadNews = (): Promise<NewsResponse | null> => readNews(newsRead)
	if (page !== 1 || cursor || pageSize !== undefined) {
		return loadNews()
	}

	// a visitor's copy of the profile's window, and the person's own copy of theirs
	if (userId === null) {
		return cacheJson({ key: `visitor-news:${profileUserId}:${window}`, ttlMs: NEWS_FIRST_PAGE_TTL_MS, load: loadNews })
	}
	if (userId === profileUserId) {
		return cacheJson({ key: toOwnNewsKey(userId, window), ttlMs: NEWS_FIRST_PAGE_TTL_MS, load: loadNews })
	}
	return loadNews()
}

/**
 * Deletes a person's own first page of every window in one delete, after their own write that their news shows: a
 * Comment, a reaction, a Topic Post's publish or delete, or a follow.
 */
export async function clearOwnNews(userId: string): Promise<void> {
	await deleteRedisKeys(...newsWindows.map((window) => toOwnNewsKey(userId, window)))
}

// the key of a person's own first page of a window
function toOwnNewsKey(userId: string, window: NewsWindow): string {
	return `own-news:${userId}:${window}`
}
