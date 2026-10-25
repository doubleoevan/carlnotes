import { searchSite } from "@carlnotes/client/searchClient"
import {
	SEARCH_MIN_CHARS,
	SEARCH_RESULT_KINDS,
	type SearchRequest,
	type SearchResultsPage,
} from "@carlnotes/contracts/search"
import { toCountLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { SearchResultsList, SearchResultsSkeleton } from "@/components/search/SearchResultsList"
import { SEARCH_RESULT_KIND_LABELS, TOPIC_FINDING_FILTER_LABELS } from "@/components/search/searchFilterOptions"
import { toReportingFindingHandlers, toSearchPageWithFindingChange } from "@/components/search/searchFindingChanges"
import { toRouteSearchRequest, toSearchRouteSearch } from "@/components/search/searchRouteSearch"
import { TagsAndNewTopicRow } from "@/components/topic/TagsAndNewTopicRow"
import { useLoadInBrowser } from "@/hooks/useBrowserValue"
import { PAGE_CLASS, PAGE_HEADER_CLASS, PAGE_TITLE_CLASS } from "@/lib/styleClasses"
import { type TopicFeedHandlers, useIsSignedIn, useTopicFeedActions } from "@/providers/TopicFeedProvider"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

// the search route, whose loader reads a visitor's search on the server
const searchRoute = getRouteApi("/_layout/search")

/**
 * The search page: the Tags picker and the New Topic button, then every kind of result for the search in the url,
 * listed as the feed lists its findings, a page at a time. The search bar above it shows and changes the query, the
 * filters, and the sort.
 */
export function SearchPage() {
	const navigate = useNavigate()

	// the search bar's menu leaves out New topic, which the page's own button opens
	useRegisterPageActions({ page: "Search", hasNewTopicButton: true })

	// the search the url names, and the page of it the server read for a visitor
	const searchRequest = toRouteSearchRequest(searchRoute.useSearch())
	const loadedSearchPage = searchRoute.useLoaderData({ select: (loaderData) => loaderData?.searchPage ?? null })
	const [searchPage, setSearchPage] = useState<SearchResultsPage | null>(loadedSearchPage)
	const [isSearchLoading, setIsSearchLoading] = useState(false)
	const [isSearchFailed, setIsSearchFailed] = useState(false)

	// the search without its page, and the one whose page is on screen
	const searchKey = JSON.stringify(searchRequest)
	const pagelessSearchKey = JSON.stringify({ ...searchRequest, page: 1 })
	const shownPagelessSearchKeyRef = useRef(pagelessSearchKey)

	// read the search in the browser for each new url, except the one the server read. a new search clears the old
	// results, and a new page of the same search keeps its count and page row while the page loads
	const handleLoadSearchPage = useCallback((): void => {
		if (shownPagelessSearchKeyRef.current !== pagelessSearchKey) {
			setSearchPage(null)
		}
		shownPagelessSearchKeyRef.current = pagelessSearchKey
		setIsSearchLoading(true)
		setIsSearchFailed(false)
		searchSite(JSON.parse(searchKey) as SearchRequest)
			.then(setSearchPage)
			.catch(() => setIsSearchFailed(true))
			.finally(() => setIsSearchLoading(false))
	}, [searchKey, pagelessSearchKey])
	useLoadInBrowser({ pageId: searchKey, isLoadedOnServer: loadedSearchPage !== null, loadPage: handleLoadSearchPage })

	// a finding's note saves through the feed's handlers, and a signed-in user's row shows each change at once. a
	// visitor's open counts a view and marks nothing read
	const providerTopicFeedHandlers = useTopicFeedActions()
	const isSignedIn = useIsSignedIn()
	const topicFeedHandlers =
		providerTopicFeedHandlers &&
		isSignedIn &&
		toReportingFindingHandlers(providerTopicFeedHandlers, (findingChange) =>
			setSearchPage(
				(shownSearchPage) => shownSearchPage && toSearchPageWithFindingChange(shownSearchPage, findingChange),
			),
		)

	return (
		<main className={PAGE_CLASS}>
			{/* the Tags picker to the left and the New Topic button to the right. a tag change opens the search's first page
			    with it */}
			<TagsAndNewTopicRow
				tags={searchRequest.tags}
				onTagsChange={(tags) =>
					void navigate({ to: "/search", search: toSearchRouteSearch({ ...searchRequest, tags, page: 1 }) })
				}
			/>
			{/* the page title, naming how many results the query found */}
			<div className={cn(PAGE_HEADER_CLASS, "mt-4")}>
				<h1 className={PAGE_TITLE_CLASS}>
					<Search className="size-6 shrink-0" />
					{toSearchTitle(searchRequest, searchPage)}
				</h1>
			</div>
			{/* a short query, the loading state, a failed search, an empty search, or the results */}
			<div className="mt-4">
				<SearchPageResults
					searchRequest={searchRequest}
					searchPage={searchPage}
					isSearchLoading={isSearchLoading}
					isSearchFailed={isSearchFailed}
					topicFeedHandlers={topicFeedHandlers || undefined}
				/>
			</div>
		</main>
	)
}

// the page's title: how many results the query found once they load, such as 25 search results for "test"
function toSearchTitle(searchRequest: SearchRequest, searchPage: SearchResultsPage | null): string {
	if (searchRequest.q.length < SEARCH_MIN_CHARS) {
		return "Search"
	}
	return searchPage
		? `${toCountLabel(searchPage.rowCount, "search result")} for “${searchRequest.q}”`
		: `Search results for “${searchRequest.q}”`
}

// what the page shows under its title: a hint for a short query, a failed search, skeleton rows for a new search, an
// empty search, or the results with their page links, whose rows show as skeletons while another page loads
function SearchPageResults({
	searchRequest,
	searchPage,
	isSearchLoading,
	isSearchFailed,
	topicFeedHandlers,
}: {
	searchRequest: SearchRequest
	searchPage: SearchResultsPage | null
	isSearchLoading: boolean
	isSearchFailed: boolean
	topicFeedHandlers?: TopicFeedHandlers
}) {
	if (searchRequest.q.length < SEARCH_MIN_CHARS) {
		return <p className="text-muted-foreground py-6 text-sm">Type at least two characters, and Carl goes looking.</p>
	}
	if (isSearchFailed) {
		return <p className="text-muted-foreground py-6 text-sm">Carl couldn't search just now. Try again in a minute.</p>
	}
	if (searchPage === null) {
		return <SearchResultsSkeleton rowCount={searchRequest.size} />
	}
	if (searchPage.rowCount === 0) {
		return <EmptySearch searchRequest={searchRequest} />
	}
	// each page link is the same search at that page, a new history entry
	return (
		<SearchResultsList
			searchPage={searchPage}
			loadingPageNumber={isSearchLoading ? searchRequest.page : undefined}
			topicFeedHandlers={topicFeedHandlers}
			searchPagination={{
				renderPageLink: ({ linkedPageNumber, label, className, isCurrentPage, onClick }) => (
					<Link
						to="/search"
						search={toSearchRouteSearch({ ...searchRequest, page: linkedPageNumber })}
						onClick={onClick}
						aria-current={isCurrentPage ? "page" : undefined}
						className={className}
					>
						{label}
					</Link>
				),
			}}
		/>
	)
}

// the empty search, naming a view that searches findings alone and the kinds of results that are turned off
function EmptySearch({ searchRequest }: { searchRequest: SearchRequest }) {
	const offResultKinds = SEARCH_RESULT_KINDS.filter(
		(searchResultKind) => !searchRequest.kinds.includes(searchResultKind),
	)
	const offLabels = offResultKinds.map((searchResultKind) => SEARCH_RESULT_KIND_LABELS[searchResultKind])
	return (
		<div className="text-muted-foreground py-6 text-sm">
			<p>Carl looked everywhere. Nothing matches “{searchRequest.q}”.</p>
			{/* a view that only findings have, which leaves out every other kind */}
			{searchRequest.view !== "all" && (
				<p className="mt-1">{TOPIC_FINDING_FILTER_LABELS[searchRequest.view]} searches findings only.</p>
			)}
			{/* the kinds the Filters menu turned off, which might hold a match */}
			{offLabels.length > 0 && <p className="mt-1">Turned off in Filters: {offLabels.join(", ")}.</p>}
		</div>
	)
}
