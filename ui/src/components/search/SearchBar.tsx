import {
	type TeamSearchResult,
	type TopicFeed,
	type TopicFinding,
	USER_SEARCH_MIN_CHARS,
	type UserSearchResult,
} from "@shared/contracts"
import { Search, X } from "lucide-react"
import { type KeyboardEvent, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { searchUsers } from "@/clients/profileClient"
import { searchTeams } from "@/clients/teamClient"
import { sendTopicFindingOpened } from "@/clients/topicClient"
import { Input } from "@/components/primitives/input"
import { PageActionMenu } from "@/components/search/PageActionMenu"
import { SEARCH_RESULT_TYPES, SearchFilters, type SearchResultType } from "@/components/search/SearchFilters"
import { ResourceResult, TeamResult, TopicResult, UserResult } from "@/components/search/SearchResults"
import { TopicFeedSort } from "@/components/topic/TopicFeedSort"
import { useTopicFeed } from "@/providers/TopicFeedProvider"

// a typeahead suggestion type: a topic, one of its findings, a team, or a user profile
type SearchResultSuggestion =
	| { type: "topic"; topic: TopicFeed }
	| { type: "resource"; resource: TopicFinding }
	| { type: "team"; team: TeamSearchResult }
	| { type: "user"; user: UserSearchResult }

const MAX_TOPIC_SUGGESTIONS = 4
const MAX_RESOURCE_SUGGESTIONS = 6

// how long typing pauses before a user or team search is sent, so a fast typist spends one request instead of ten
const SEARCH_DEBOUNCE_MS = 200

// how far each arrow key moves the highlight
const ARROW_STEP: Record<string, number | undefined> = { ArrowDown: 1, ArrowUp: -1 }

// the ids tying the input to its list and to the highlighted row, which is how a screen reader follows the arrows
const SUGGESTION_LIST_ID = "search-suggestions"
const SUGGESTION_ID_PREFIX = "search-suggestion-"

/**
 * The search bar that overlaps the hero.
 * a search input with a clear button, a typeahead over topics, findings, teams, and users, and the Filters menu
 */
export function SearchBar() {
	const { topicFeed } = useTopicFeed()
	const navigate = useNavigate()
	const [query, setQuery] = useState("")
	const [isFocused, setFocused] = useState(false)
	// the highlighted suggestion index, or -1 when the user hasn't selected one with the arrow keys
	const [suggestionIndex, setSuggestionIndex] = useState(-1)
	// the search's result kinds filter
	const [searchResultTypes, setSearchResultTypes] = useState<Set<SearchResultType>>(new Set(SEARCH_RESULT_TYPES))
	const handleToggleSearchResultType = (searchResultType: SearchResultType): void => {
		setSearchResultTypes((previousSearchResultTypes) => {
			const nextSearchResultTypes = new Set(previousSearchResultTypes)
			if (nextSearchResultTypes.has(searchResultType)) {
				nextSearchResultTypes.delete(searchResultType)
			} else {
				nextSearchResultTypes.add(searchResultType)
			}
			return nextSearchResultTypes
		})
	}

	// flatten the topic feed findings for the typeahead. dedupe topics, which can appear in both Featured and Popular
	const topicFindings = topicFeed
		? topicFeed.sections.flatMap((section) => section.topics.flatMap((topic) => topic.findings))
		: []
	const sectionTopics = topicFeed?.sections.flatMap((topicSection) => topicSection.topics) ?? []
	const topics = [...new Map(sectionTopics.map((topic) => [topic.id, topic])).values()]

	// match topics by name and topic findings by title, or the url when there is no title. limit each list
	const searchQuery = query.trim().toLowerCase()
	const topicMatches = searchQuery
		? topics.filter((topic) => topic.name.toLowerCase().includes(searchQuery)).slice(0, MAX_TOPIC_SUGGESTIONS)
		: []
	const resourceMatches = searchQuery
		? topicFindings
				.filter((resource) => (resource.title ?? resource.url).toLowerCase().includes(searchQuery))
				.slice(0, MAX_RESOURCE_SUGGESTIONS)
		: []

	// topics and findings are already loaded. teams and users are not, and both are searched as the typing pauses
	const { matches: userMatches, isSearching: isSearchingUsers } = useDebouncedSearch(
		searchQuery,
		searchResultTypes.has("users"),
		searchUsers,
	)
	const { matches: teamMatches, isSearching: isSearchingTeams } = useDebouncedSearch(
		searchQuery,
		searchResultTypes.has("teams"),
		searchTeams,
	)

	// topics, then teams, then users, then findings, so the arrow keys walk one combined search suggestions list
	const searchSuggestions: SearchResultSuggestion[] = [
		...(searchResultTypes.has("topics") ? topicMatches.map((topic) => ({ type: "topic" as const, topic })) : []),
		...teamMatches.map((team) => ({ type: "team" as const, team })),
		...userMatches.map((user) => ({ type: "user" as const, user })),
		...(searchResultTypes.has("findings")
			? resourceMatches.map((resource) => ({ type: "resource" as const, resource }))
			: []),
	]

	// the search suggestions dropdown shows while the input is focused and has a query
	const showSearchSuggestion = isFocused && searchQuery.length > 0

	// clear the search and the search suggestions
	const handleClearSearch = (): void => {
		setQuery("")
		setSuggestionIndex(-1)
	}

	// arrow keys move the highlight, enter opens the highlighted suggestion or the only one
	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (!showSearchSuggestion) {
			return
		}
		// navigate the search suggestion list with arrow keys
		const arrowStep = ARROW_STEP[event.key]
		if (arrowStep) {
			event.preventDefault()
			setSuggestionIndex((index) => clampSuggestionIndex(index + arrowStep, searchSuggestions.length))
			return
		}
		// open a search suggestion on enter
		if (event.key === "Enter") {
			const searchSuggestion = searchSuggestions[suggestionIndex] ?? findOnlySuggestion(searchSuggestions)
			if (searchSuggestion) {
				event.preventDefault()
				openSearchSuggestion(searchSuggestion)
			}
		}
	}

	// open the topic, team, or user profile page, or the resource in a new tab, then clear the search
	const openSearchSuggestion = (suggestion: SearchResultSuggestion): void => {
		if (suggestion.type === "topic") {
			navigate(`/topics/${suggestion.topic.id}`)
		} else if (suggestion.type === "team") {
			navigate(`/teams/${suggestion.team.teamId}`)
		} else if (suggestion.type === "user") {
			navigate(`/profiles/${suggestion.user.userId}`)
		} else {
			void sendTopicFindingOpened(suggestion.resource.findingId)
			window.open(suggestion.resource.url, "_blank", "noopener,noreferrer")
		}
		handleClearSearch()
	}

	return (
		<div className="relative">
			<div className="bg-card border-border flex items-center gap-2 rounded-lg border py-2 pr-2 pl-3 shadow-lift">
				{/* the magnifying glass, then the search input */}
				<Search className="text-muted-foreground size-4 shrink-0" />
				<Input
					value={query}
					onChange={(event) => {
						setQuery(event.target.value)
						setSuggestionIndex(-1)
					}}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					onKeyDown={handleKeyDown}
					role="combobox"
					aria-expanded={showSearchSuggestion}
					aria-controls={showSearchSuggestion ? SUGGESTION_LIST_ID : undefined}
					aria-autocomplete="list"
					aria-activedescendant={suggestionIndex >= 0 ? `${SUGGESTION_ID_PREFIX}${suggestionIndex}` : undefined}
					aria-label="Search topics, findings, teams and users..."
					placeholder="Topics, findings, teams, users…"
					className="h-11 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 sm:h-9 dark:bg-transparent"
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
						searchResultTypes={searchResultTypes}
						onToggleSearchResultType={handleToggleSearchResultType}
					/>
					<TopicFeedSort />
					<PageActionMenu />
				</div>
			</div>
			{/* the typeahead suggestion dropdown. a suggestion is highlighted on hover or on arrown navigation */}
			{showSearchSuggestion && (
				<div
					id={SUGGESTION_LIST_ID}
					role="listbox"
					aria-label="Search suggestions"
					onMouseDown={(event) => event.preventDefault()}
					className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border p-1 shadow-lift"
				>
					{searchSuggestions.map((suggestion, index) => {
						const suggestionId = `${SUGGESTION_ID_PREFIX}${index}`
						if (suggestion.type === "topic") {
							return (
								<TopicResult
									key={`topic-${suggestion.topic.id}`}
									suggestionId={suggestionId}
									topic={suggestion.topic}
									isActive={index === suggestionIndex}
									onOpen={handleClearSearch}
								/>
							)
						}
						if (suggestion.type === "team") {
							return (
								<TeamResult
									key={`team-${suggestion.team.teamId}`}
									suggestionId={suggestionId}
									team={suggestion.team}
									isActive={index === suggestionIndex}
									onOpen={handleClearSearch}
								/>
							)
						}
						if (suggestion.type === "user") {
							return (
								<UserResult
									key={`user-${suggestion.user.userId}`}
									suggestionId={suggestionId}
									user={suggestion.user}
									isActive={index === suggestionIndex}
									onOpen={handleClearSearch}
								/>
							)
						}
						return (
							<ResourceResult
								key={`resource-${suggestion.resource.findingId}`}
								suggestionId={suggestionId}
								resource={suggestion.resource}
								isActive={index === suggestionIndex}
								onOpen={handleClearSearch}
							/>
						)
					})}
					{/* the empty suggestions state is hidden while a search is still pending */}
					{searchSuggestions.length === 0 && !isSearchingUsers && !isSearchingTeams && (
						<p className="text-muted-foreground px-2 py-3 text-sm">No matches found.</p>
					)}
				</div>
			)}
		</div>
	)
}

/**
 * One remote search that waits for the typing to pause. The bar runs it once for users and once for teams,
 * and a search that is filtered out or too short clears its matches without fetching.
 */
function useDebouncedSearch<Match>(
	searchQuery: string,
	isEnabled: boolean,
	search: (searchQuery: string) => Promise<Match[]>,
): { matches: Match[]; isSearching: boolean } {
	const [matches, setMatches] = useState<Match[]>([])
	const [isSearching, setIsSearching] = useState(false)
	useEffect(() => {
		if (!isEnabled || searchQuery.length < USER_SEARCH_MIN_CHARS) {
			setMatches([])
			setIsSearching(false)
			return
		}

		// only the newest search may write. a result that lands after the query moved on is dropped
		let isCurrent = true
		setIsSearching(true)
		const timer = setTimeout(() => {
			search(searchQuery)
				.catch(() => [])
				.then((found) => {
					if (isCurrent) {
						setMatches(found)
						setIsSearching(false)
					}
				})
		}, SEARCH_DEBOUNCE_MS)
		return () => {
			isCurrent = false
			clearTimeout(timer)
		}
	}, [searchQuery, isEnabled, search])
	return { matches, isSearching }
}

// keep the highlight suggestion index inside the list
function clampSuggestionIndex(index: number, suggestionCount: number): number {
	return Math.max(0, Math.min(index, suggestionCount - 1))
}

// the lone suggestion when the list has exactly one option, so enter can open it without arrowing to it first
function findOnlySuggestion(searchSuggestions: SearchResultSuggestion[]): SearchResultSuggestion | undefined {
	return searchSuggestions.length === 1 ? searchSuggestions[0] : undefined
}
