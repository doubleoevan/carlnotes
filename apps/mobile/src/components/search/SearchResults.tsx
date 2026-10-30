import { authClient } from "@carlnotes/client/authClient"
import { searchSite } from "@carlnotes/client/searchClient"
import { SEARCH_MIN_CHARS, type SearchResultsPage, searchRequestPayload } from "@carlnotes/contracts/search"
import { useTopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import { toCountLabel } from "@carlnotes/core/lib/labels"
import { type InfiniteData, type UseQueryResult, useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react-native"
import { type ComponentRef, useEffect, useRef, useState } from "react"
import { ScrollView, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Pagination } from "@/components/common/Pagination"
import { Footer } from "@/components/layout/Footer"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import type { TopicFeedControlsProps } from "@/components/topic/TopicFeedControls"
import { TopicHomeActions } from "@/components/topic/TopicHomeActions"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { SearchResultsList } from "./SearchResultsList"

/**
 * Searches the existing API and opens native Topic, Team, Profile, and Finding destinations.
 */
export function SearchResults({
	filters,
	searchText,
	knownTags = [],
}: Pick<TopicFeedControlsProps, "filters"> & { searchText: string; knownTags?: string[] }) {
	// share finding actions and their pending state with Home and Topic screens
	const { query, queryText, pageNumber, openPage } = useSearchResults({ filters, searchText })
	const { data: session } = authClient().useSession()
	const state = useTopicFindingActions({ userId: session?.user.id ?? null, shouldUpdateOptimistically: true })
	const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
	const hasQuery = queryText.length >= SEARCH_MIN_CHARS
	const rowCount = query.data?.pages[0]?.rowCount
	const title = !hasQuery
		? "Search"
		: `${rowCount === undefined ? "Search results" : toCountLabel(rowCount, "search result")} for “${queryText}”`
	return (
		<ScrollView
			ref={scrollRef}
			keyboardShouldPersistTaps="handled"
			keyboardDismissMode="on-drag"
			className="flex-1"
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			{/* the web's tags, new topic action, and counted search title */}
			<TopicHomeActions filters={filters} knownTags={knownTags} />
			<View className="mx-4 mt-4 mb-4 flex-row items-start gap-2">
				<Icon as={Search} className="mt-0.5 size-6 text-foreground" />
				<Text accessibilityRole="header" style={toTypeRoleStyle("pageTitle")} className="flex-1">
					{title}
				</Text>
			</View>
			{/* search status and results */}
			<View className="px-4">
				<SearchStatus
					isSearching={query.isFetching && !query.data}
					hasError={query.isError}
					hasQuery={hasQuery}
					hasRows={Boolean(rowCount)}
					searchText={queryText}
					onRetry={() => void query.refetch()}
				/>
			</View>
			{query.data && rowCount ? <SearchResultsList pages={query.data.pages} state={state} /> : null}
			{query.data ? (
				<Pagination
					label="Search results"
					pageNumber={pageNumber}
					pageCount={query.data.pages[0]?.pageCount ?? 1}
					onOpenPage={(page) => {
						openPage(page)
						scrollRef.current?.scrollTo({ y: 0, animated: false })
					}}
				/>
			) : null}
			<Footer />
		</ScrollView>
	)
}

// debounce typing and scope transient results to the signed-in account
function useSearchResults({ filters, searchText }: Pick<TopicFeedControlsProps, "filters"> & { searchText: string }): {
	query: UseQueryResult<InfiniteData<SearchResultsPage>, Error>
	queryText: string
	pageNumber: number
	openPage: (page: number) => void
} {
	// debounce the text independently of the selected filters
	const [queryText, setQueryText] = useState("")
	const [selection, setSelection] = useState({ key: "", page: 1 })
	const { data: session } = authClient().useSession()
	useEffect(() => {
		const timer = setTimeout(() => setQueryText(searchText.trim()), 300)
		return () => clearTimeout(timer)
	}, [searchText])

	// report invalid requests through the same retry state as network failures
	const searchRequest = {
		q: queryText,
		sort: filters.sort,
		view: filters.findingFilter,
		resourceKinds: [...filters.resourceKinds],
		tags: filters.tagFilters,
		tagMatch: filters.tagMatchMode,
	}
	// keep one server page mounted and reset pagination when the query or filters change
	const searchKey = JSON.stringify(searchRequest)
	const pageNumber = selection.key === searchKey ? selection.page : 1
	const query = useQuery({
		queryKey: ["site-search", session?.user.id, searchRequest, pageNumber],
		queryFn: async ({ signal }) => ({
			pages: [await searchSite(searchRequestPayload.parse({ ...searchRequest, page: pageNumber }), signal)],
			pageParams: [pageNumber],
		}),
		enabled: queryText.length >= SEARCH_MIN_CHARS,
		gcTime: 0,
	})
	// keep the current page reachable when a confirmed action removes its last result
	const pageCount = query.data?.pages[0]?.pageCount
	useEffect(() => {
		if (pageCount !== undefined && pageNumber > Math.max(1, pageCount)) {
			setSelection({ key: searchKey, page: Math.max(1, pageCount) })
		}
	}, [pageCount, pageNumber, searchKey])
	return { query, queryText, pageNumber, openPage: (page) => setSelection({ key: searchKey, page }) }
}

/**
 * Says the search is loading, failed, needs more characters, or found nothing, keeping a failure distinct from an
 * empty successful search. A failed refetch shows the failure above the stale rows.
 */
export function SearchStatus({
	isSearching,
	hasError,
	hasQuery,
	hasRows,
	searchText,
	onRetry,
}: {
	isSearching: boolean
	hasError: boolean
	hasQuery: boolean
	hasRows: boolean
	searchText: string
	onRetry: () => void
}) {
	if (isSearching) {
		return <CoffeeLoading label="Loading your search results" className="justify-start gap-3 py-6" />
	}
	if (hasError) {
		return (
			<Button variant="outline" accessibilityLabel="Retry search" onPress={onRetry}>
				<Text>{"Carl couldn't search just now. Try again in a minute."}</Text>
			</Button>
		)
	}
	if (!hasQuery) {
		return (
			<Text className="py-6 text-sm text-muted-foreground">Type at least two characters, and Carl goes looking.</Text>
		)
	}
	if (!hasRows) {
		return (
			<Text className="py-6 text-sm text-muted-foreground">{`Carl looked everywhere. Nothing matches “${searchText}”.`}</Text>
		)
	}
	return null
}
