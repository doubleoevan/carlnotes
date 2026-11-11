import { fetchNews, fetchProfileNews } from "@carlnotes/client/newsClient"
import { DEFAULT_NEWS_WINDOW, type NewsResponse, type NewsWindow } from "@carlnotes/contracts/news"
import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query"

// the query key a news page is cached under, and how long a page stays fresh
const NEWS_QUERY_KEY = "news"
const NEWS_STALE_MS = 60_000

// one page of a window to read: the window, the page's number, and the cursor the window's first page returned
type NewsPageQuery = { window: NewsWindow; page: number; cursor?: string }

/**
 * A read of one page of the news in place of the api's, such as an MCP view's tool call.
 */
export type NewsPageLoader = (newsPageQuery: NewsPageQuery) => Promise<NewsResponse>

// whose news it is, or null for the signed-in user's own, who reads it, the window, the page, the first page of the
// first window if it is already read, that window, and the read that replaces the api's
type UseNewsOptions = {
	profileUserId: string | null
	userId: string | null
	window: NewsWindow
	page: number
	// the first window's first page, that window, the week unless named, and the read in place of the api's
	firstPage?: NewsResponse
	firstWindow?: NewsWindow
	loadNewsPage?: NewsPageLoader
}

/**
 * Reads one numbered page of a window's news. A profile's news reads for anyone, and the user's own needs a session.
 * A page passes back the cursor the window's first page returned, so every page reads the same rows, and a page's rows
 * stay on screen while another page of the same window loads.
 */
export function useNews({
	profileUserId,
	userId,
	window,
	page,
	firstPage,
	firstWindow = DEFAULT_NEWS_WINDOW,
	loadNewsPage,
}: UseNewsOptions): UseQueryResult<NewsResponse> {
	const queryClient = useQueryClient()
	const toQueryKey = (pageNumber: number): unknown[] => [NEWS_QUERY_KEY, profileUserId, userId, window, pageNumber]
	return useQuery({
		queryKey: toQueryKey(page),
		queryFn: () => {
			// the window's first page, if it is read, fixed the window's rows
			const cursor = queryClient.getQueryData<NewsResponse>(toQueryKey(1))?.cursor
			const query = { window, page, cursor }

			// a read in place of the api's takes the same query
			if (loadNewsPage) {
				return loadNewsPage(query)
			}
			return profileUserId ? fetchProfileNews(profileUserId, query) : fetchNews(query)
		},
		enabled: profileUserId !== null || userId !== null,
		// the page already read is the first window's first one
		initialData: window === firstWindow && page === 1 ? firstPage : undefined,
		// keep the last page's rows while the next loads, but never another window's
		placeholderData: (previousNewsPage, previousQuery) =>
			previousQuery?.queryKey[3] === window ? previousNewsPage : undefined,
		staleTime: NEWS_STALE_MS,
	})
}
