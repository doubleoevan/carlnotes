import type { AnalyticsEventProperties, VisitAnalyticsEvent } from "@carlnotes/contracts/analyticsEvents"
import {
	DEFAULT_NEWS_WINDOW,
	NEWS_PAGE_SIZE,
	type NewsPlace,
	type NewsResponse,
	type NewsWindow,
} from "@carlnotes/contracts/news"
import { useState } from "react"
import { type NewsPageLoader, useNews } from "./useNews"

// whose news it is, or null for the signed-in user's own on the home, who reads it, and how the app sends a visit event
type UseNewsListOptions = {
	profileUserId: string | null
	userId: string | null
	// the first page of the first window's news, if it is already read, and that window, the week unless named
	firstPage?: NewsResponse
	firstWindow?: NewsWindow
	// the read of a page in place of the api's
	loadNewsPage?: NewsPageLoader
	captureVisitEvent: (event: VisitAnalyticsEvent, properties: AnalyticsEventProperties) => void
}

// a news list's state: its place, the window, the page shown, the page's rows once read, and what the picker and the
// page buttons do
type NewsList = {
	// where the list shows: the home, or a profile
	place: NewsPlace
	window: NewsWindow
	// the page shown, from one, and how many pages the window holds
	pageNumber: number
	pageCount: number
	newsPage: NewsResponse | undefined
	hasFailed: boolean
	retry: () => void
	// whether the rows show under the heading, and the heading's press that opens and closes them
	isExpanded: boolean
	toggle: () => void
	selectWindow: (window: NewsWindow) => void
	openPage: (pageNumber: number) => void
}

/**
 * Holds a news list: its window, which starts at the week unless another is named, its page, which starts at the first, and whether its rows
 * show, which they do at first. Choosing a window returns to the first page and opens a closed list. Each choice of a
 * window or a page reports its event with the list's place and no text.
 */
export function useNewsList({
	profileUserId,
	userId,
	firstPage,
	firstWindow = DEFAULT_NEWS_WINDOW,
	loadNewsPage,
	captureVisitEvent,
}: UseNewsListOptions): NewsList {
	const [window, setWindow] = useState<NewsWindow>(firstWindow)
	const [pageNumber, setPageNumber] = useState(1)
	const [isExpanded, setIsExpanded] = useState(true)
	const newsPageRead = { profileUserId, userId, window, page: pageNumber, firstPage, firstWindow, loadNewsPage }
	const newsQuery = useNews(newsPageRead)
	const newsPage = newsQuery.data

	// what the list's events report: where it shows, and whose profile
	const place: NewsPlace = profileUserId ? "profile" : "home"
	const eventProperties = { place, ...(profileUserId ? { profileUserId } : {}) }
	return {
		place,
		window,
		pageNumber,
		pageCount: Math.max(1, Math.ceil((newsPage?.total ?? 0) / NEWS_PAGE_SIZE)),
		newsPage,
		hasFailed: newsQuery.isError,
		retry: () => void newsQuery.refetch(),
		isExpanded,
		toggle: () => setIsExpanded((isOpen) => !isOpen),
		// a chosen window starts at its first page, and opens a list that was closed
		selectWindow: (selectedWindow) => {
			setWindow(selectedWindow)
			setPageNumber(1)
			setIsExpanded(true)
			captureVisitEvent("social_news_window_change", { ...eventProperties, window: selectedWindow })
		},
		openPage: (openedPageNumber) => {
			setPageNumber(openedPageNumber)
			captureVisitEvent("social_news_page_open", { ...eventProperties, page: openedPageNumber })
		},
	}
}
