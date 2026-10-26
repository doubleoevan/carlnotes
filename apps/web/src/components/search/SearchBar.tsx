import { searchSite } from "@carlnotes/client/searchClient"
import { sendTopicFindingOpened } from "@carlnotes/client/topicFindingClient"
import { resourceKinds } from "@carlnotes/contracts/enums"
import type { TopicFindingSort } from "@carlnotes/contracts/findings"
import {
	SEARCH_MAX_CHARS,
	SEARCH_MIN_CHARS,
	SEARCH_RESULT_KINDS,
	type SearchRequest,
	type SearchResultKind,
	type SearchResultsPage,
	type SearchRow,
	searchRequestPayload,
	toSearchPath,
} from "@carlnotes/contracts/search"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Search, X } from "lucide-react"
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Input } from "@/components/primitives/input"
import { TopicFeedSort } from "@/components/topic/TopicFeedSort"
import { openInNewTab } from "@/lib/externalLinks"
import { saveSearchBarPath, useSearchBarClear } from "@/stores/searchBarStore"
import { PageActionMenu } from "./PageActionMenu"
import { type FindingFilterState, SearchFilters } from "./SearchFilters"
import { SearchRowOption, SeeAllResultsOption } from "./SearchResults"
import { toEnterChoice, toSearchBarPath, toToggledList } from "./searchBarChoices"
import { toRouteSearchRequest, toSearchRouteSearch } from "./searchRouteSearch"

// how long typing pauses before a search is sent, and how many results the typeahead shows
const SEARCH_DEBOUNCE_MS = 200
const TYPEAHEAD_PAGE_SIZE = 10

// how far each arrow key moves the highlight
const ARROW_STEP: Record<string, number | undefined> = { ArrowDown: 1, ArrowUp: -1 }

// the ids tying the input to its list and to the highlighted row, which is how a screen reader follows the arrows
const SUGGESTION_LIST_ID = "search-suggestions"
const SUGGESTION_ID_PREFIX = "search-suggestion-"

/**
 * The search bar that overlaps the hero. A search input with a clear button, a typeahead over the first page of the
 * site search, the Filters menu, and the Sort menu. Enter opens the highlighted row or the only one, and otherwise the
 * search page. On the search page, the input, the kinds, and the sort show and change the page's url.
 */
export function SearchBar() {
	const navigate = useNavigate()
	const inputRef = useRef<HTMLInputElement>(null)

	// the search page's url search, or undefined on every other page
	const routeSearch = useSearch({ from: "/_layout/search", shouldThrow: false })
	const pageSearchRequest = routeSearch ? toRouteSearchRequest(routeSearch) : null

	// the typed query, which follows the search page's url query and stays when the user leaves the search page. the
	// header's logo empties it from the search page
	const [query, setQuery] = useState(pageSearchRequest?.q ?? "")
	const pageQuery = pageSearchRequest?.q
	useEffect(() => {
		if (pageQuery !== undefined) {
			setQuery(pageQuery)
		}
	}, [pageQuery])
	useSearchBarClear(useCallback(() => setQuery(""), []))
	const [isFocused, setIsFocused] = useState(false)
	// the highlighted suggestion index, or -1 when the user hasn't selected one with the arrow keys
	const [suggestionIndex, setSuggestionIndex] = useState(-1)

	// the kinds of results: the search page's url kinds there, and the bar's own everywhere else
	const [searchBarResultKinds, setSearchBarResultKinds] = useState<SearchResultKind[]>([...SEARCH_RESULT_KINDS])
	const searchResultKinds = pageSearchRequest?.kinds ?? searchBarResultKinds
	const handleToggleSearchResultKind = (searchResultKind: SearchResultKind): void => {
		const nextSearchResultKinds = toToggledList({
			items: searchResultKinds,
			toggledItem: searchResultKind,
			menuOrder: SEARCH_RESULT_KINDS,
		})
		if (pageSearchRequest) {
			openSearchPage({ ...pageSearchRequest, kinds: nextSearchResultKinds, page: 1 })
		} else {
			setSearchBarResultKinds(nextSearchResultKinds)
		}
	}

	// the typeahead's search, the first page of the site search, sent as the typing pauses while the input is focused
	const searchQuery = query.trim()
	const typedSearchRequest = toTypedSearchRequest({ pageSearchRequest, searchQuery, searchResultKinds })
	const { searchPage, isSearching } = useDebouncedSearch({
		searchRequest: { ...typedSearchRequest, size: TYPEAHEAD_PAGE_SIZE },
		isEnabled: isFocused,
	})
	const searchRows = searchPage?.rows ?? []
	const hasMoreRows = (searchPage?.rowCount ?? 0) > searchRows.length

	// the search page this query opens, with the bar's kinds and the relevance sort, shared with the header's logo
	const searchBarPath = toSearchBarPath(typedSearchRequest)
	useEffect(() => saveSearchBarPath(searchBarPath), [searchBarPath])
	const suggestionCount = searchRows.length + (hasMoreRows ? 1 : 0)

	// the search suggestions dropdown shows while the input is focused and has a query
	const showSearchSuggestion = isFocused && searchQuery.length > 0

	// clear the search and the search suggestions
	const handleClearSearch = (): void => {
		setQuery("")
		setSuggestionIndex(-1)
	}

	// open the search page for a search, closing the typeahead and keeping the query in the input
	function openSearchPage(searchRequest: SearchRequest): void {
		setSuggestionIndex(-1)
		inputRef.current?.blur()
		void navigate({ to: "/search", search: toSearchRouteSearch(searchRequest) })
	}

	// open a row's page, or a finding's resource in a new tab, then clear the search
	const openSearchRow = (searchRow: SearchRow): void => {
		if (searchRow.kind === "finding") {
			void sendTopicFindingOpened({ findingId: searchRow.finding.findingId })
			openInNewTab(searchRow.finding.url)
		} else {
			void navigate({ to: searchRow.path })
		}
		handleClearSearch()
	}

	// arrow keys move the highlight. enter opens the highlighted row, else the only row, else the search page
	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		// navigate the search suggestion list with arrow keys
		const arrowStep = ARROW_STEP[event.key]
		if (arrowStep && showSearchSuggestion) {
			event.preventDefault()
			setSuggestionIndex((index) => clampSuggestionIndex(index + arrowStep, suggestionCount))
			return
		}
		if (event.key !== "Enter") {
			return
		}

		// open the row enter names, or the search page
		const enterChoice = toEnterChoice({
			highlightedRow: showSearchSuggestion ? searchRows[suggestionIndex] : undefined,
			searchPage,
			isSearching,
			searchQuery,
		})
		if (enterChoice) {
			event.preventDefault()
		}
		if (enterChoice === "searchPage") {
			openSearchPage(typedSearchRequest)
		} else if (enterChoice) {
			openSearchRow(enterChoice)
		}
	}

	// the sort menu sorts the search page there, and the topic feed everywhere else
	const searchSort = pageSearchRequest
		? {
				sort: pageSearchRequest.sort,
				onSort: (sort: TopicFindingSort) => openSearchPage({ ...pageSearchRequest, sort, page: 1 }),
			}
		: undefined
	return (
		<div className="relative">
			<div className="bg-card border-border flex items-center gap-2 rounded-lg border py-2 pr-2 pl-3 shadow-raised">
				{/* the magnifying glass, then the search input */}
				<Search className="text-muted-foreground size-4 shrink-0" />
				<Input
					ref={inputRef}
					value={query}
					onChange={(event) => {
						setQuery(event.target.value)
						setSuggestionIndex(-1)
					}}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					onKeyDown={handleKeyDown}
					role="combobox"
					aria-expanded={showSearchSuggestion}
					aria-controls={showSearchSuggestion ? SUGGESTION_LIST_ID : undefined}
					aria-autocomplete="list"
					aria-activedescendant={suggestionIndex >= 0 ? `${SUGGESTION_ID_PREFIX}${suggestionIndex}` : undefined}
					aria-label="Search topics, podcasts, findings, teams and users..."
					placeholder="Topics, podcasts, findings, teams, users…"
					className="h-11 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 sm:h-9"
				/>
				{query && (
					<button
						type="button"
						onClick={() => setQuery("")}
						aria-label="Clear search"
						className="text-muted-foreground hover:text-foreground grid size-8 shrink-0 place-items-center rounded-md"
					>
						<X className="size-4" />
					</button>
				)}
				{/* filter, sort, and page action menus sit to the right of the search */}
				<div className="flex shrink-0 items-center">
					<div className="bg-border h-6 w-px" />
					<SearchFilters
						searchResultKinds={new Set(searchResultKinds)}
						onToggleSearchResultKind={handleToggleSearchResultKind}
						searchFindingFilterState={
							pageSearchRequest ? toSearchFindingFilterState(pageSearchRequest, openSearchPage) : undefined
						}
					/>
					<TopicFeedSort searchSort={searchSort} />
					<PageActionMenu />
				</div>
			</div>
			{/* the typeahead suggestion dropdown. a suggestion is highlighted on hover or on arrow navigation */}
			{showSearchSuggestion && (
				<div
					id={SUGGESTION_LIST_ID}
					role="listbox"
					aria-label="Search suggestions"
					onMouseDown={(event) => event.preventDefault()}
					className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border p-1 shadow-raised"
				>
					{searchRows.map((searchRow, index) => (
						<SearchRowOption
							key={`${searchRow.kind}-${searchRow.id}`}
							suggestionId={`${SUGGESTION_ID_PREFIX}${index}`}
							searchRow={searchRow}
							isActive={index === suggestionIndex}
							onOpen={handleClearSearch}
						/>
					))}
					{/* every result on the search page, if the typeahead shows only some */}
					{hasMoreRows && searchPage && (
						<SeeAllResultsOption
							suggestionId={`${SUGGESTION_ID_PREFIX}${searchRows.length}`}
							href={toSearchPath(typedSearchRequest)}
							rowCount={searchPage.rowCount}
							isActive={suggestionIndex === searchRows.length}
							onOpen={() => {
								setSuggestionIndex(-1)
								inputRef.current?.blur()
							}}
						/>
					)}
					{/* the steaming mug while the first rows load, then the empty state if none match */}
					{searchRows.length === 0 && <NoSuggestions isSearching={isSearching} />}
				</div>
			)}
		</div>
	)
}

// the dropdown with no rows: the steaming mug while a search is on its way, and the empty state once it finds none
function NoSuggestions({ isSearching }: { isSearching: boolean }) {
	return isSearching ? (
		<CoffeeLoading className="min-h-0 justify-start px-2 py-3 text-sm" />
	) : (
		<p className="text-muted-foreground px-2 py-3 text-sm">No matches found.</p>
	)
}

/**
 * The typeahead's site search, sent once the typing pauses while the input is focused. A query under the minimum length
 * or an input without focus clears the page without fetching, and a failed search reads as no rows.
 */
function useDebouncedSearch({ searchRequest, isEnabled }: { searchRequest: SearchRequest; isEnabled: boolean }): {
	searchPage: SearchResultsPage | null
	isSearching: boolean
} {
	const [searchPage, setSearchPage] = useState<SearchResultsPage | null>(null)
	const [isSearching, setIsSearching] = useState(false)
	const searchRequestKey = JSON.stringify(searchRequest)
	useEffect(() => {
		const keyedSearchRequest = JSON.parse(searchRequestKey) as SearchRequest
		if (!isEnabled || keyedSearchRequest.q.length < SEARCH_MIN_CHARS) {
			setSearchPage(null)
			setIsSearching(false)
			return
		}

		// only the newest search may write. a search the query moved past is aborted, and its result dropped
		const abortController = new AbortController()
		setIsSearching(true)
		const timer = setTimeout(() => {
			searchSite(keyedSearchRequest, abortController.signal)
				.catch(() => null)
				.then((foundSearchPage) => {
					if (!abortController.signal.aborted) {
						setSearchPage(foundSearchPage)
						setIsSearching(false)
					}
				})
		}, SEARCH_DEBOUNCE_MS)
		return () => {
			abortController.abort()
			clearTimeout(timer)
		}
	}, [searchRequestKey, isEnabled])
	return { searchPage, isSearching }
}

// the search a typed query names, its query cut to the longest the search reads, from the first page. on the search
// page it keeps the page's filters and sort, and elsewhere it starts from the defaults
function toTypedSearchRequest({
	pageSearchRequest,
	searchQuery,
	searchResultKinds,
}: {
	pageSearchRequest: SearchRequest | null
	searchQuery: string
	searchResultKinds: SearchResultKind[]
}): SearchRequest {
	return searchRequestPayload.parse({
		...pageSearchRequest,
		q: searchQuery.slice(0, SEARCH_MAX_CHARS),
		kinds: searchResultKinds,
		page: 1,
	})
}

// the search page's finding, resource kind, and tag filters for the Filters menu. each change opens the search's first
// page with it
function toSearchFindingFilterState(
	pageSearchRequest: SearchRequest,
	openSearchPage: (searchRequest: SearchRequest) => void,
): FindingFilterState {
	const openFilteredSearchPage = (searchRequestChange: Partial<SearchRequest>): void =>
		openSearchPage({ ...pageSearchRequest, ...searchRequestChange, page: 1 })
	return {
		resourceKinds: new Set(pageSearchRequest.resourceKinds),
		toggleResourceKind: (resourceKind) =>
			openFilteredSearchPage({
				resourceKinds: toToggledList({
					items: pageSearchRequest.resourceKinds,
					toggledItem: resourceKind,
					menuOrder: resourceKinds,
				}),
			}),
		findingFilter: pageSearchRequest.view,
		setFindingFilter: (view) => openFilteredSearchPage({ view }),
		tagMatchMode: pageSearchRequest.tagMatch,
		setTagMatchMode: (tagMatch) => openFilteredSearchPage({ tagMatch }),
	}
}

// keep the highlight suggestion index inside the list
function clampSuggestionIndex(index: number, suggestionCount: number): number {
	return Math.max(0, Math.min(index, suggestionCount - 1))
}
