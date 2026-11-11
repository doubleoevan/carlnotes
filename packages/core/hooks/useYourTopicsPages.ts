import { fetchYourTopicsPage } from "@carlnotes/client/homeClient"
import { CARDS_PAGE_SIZE, type TopicCard, type YourTopicsPage } from "@carlnotes/contracts/home"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import type { PageSelection } from "./usePagination"

// the query key a later page of a user's topics is cached under
const YOUR_TOPICS_QUERY_KEY = "your-topics"

/**
 * Pages through a user's own and followed topics six at a time. The home payload holds the first page, and each later
 * page is requested when the user opens it, the previous page staying on screen until it loads.
 */
export function useYourTopicsPages(firstPage: YourTopicsPage | null): {
	pageTopics: TopicCard[]
	pagination: PageSelection
} {
	// the page asked for, kept inside the pages the total holds
	const [page, setPage] = useState(0)
	const totalCount = firstPage?.totalCount ?? 0
	const pageCount = Math.max(1, Math.ceil(totalCount / CARDS_PAGE_SIZE))
	const currentPage = Math.min(page, pageCount - 1)

	// a later page, read again whenever the home payload's total changes
	const laterPageQuery = useQuery({
		queryKey: [YOUR_TOPICS_QUERY_KEY, totalCount, currentPage],
		queryFn: () => fetchYourTopicsPage(currentPage),
		enabled: firstPage !== null && currentPage > 0,
		placeholderData: keepPreviousData,
		retry: false,
	})
	const pageTopics = currentPage === 0 ? (firstPage?.topics ?? []) : (laterPageQuery.data?.topics ?? [])
	return { pageTopics, pagination: { page: currentPage, pageCount, setPage } }
}
