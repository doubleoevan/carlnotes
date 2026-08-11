import { type TopicFeed, type TopicFinding, USER_SEARCH_MIN_CHARS, type UserSearchResult } from "@shared/contracts"
import { Search, X } from "lucide-react"
import { type KeyboardEvent, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Input } from "@/components/primitives/input"
import { SEARCH_RESULT_TYPES, SearchFilters, type SearchResultType } from "@/components/search/SearchFilters"
import { ResourceResult, TopicResult, UserResult } from "@/components/search/SearchResults"
import { searchUsers } from "@/lib/profileClient"
import { sendTopicFindingOpened } from "@/lib/topicClient"
import { useTopicFeed } from "@/providers/TopicFeedProvider"

// a single typeahead suggestion: a topic, one of its findings, or a user to open the profile of
type SearchResultSuggestion =
	| { type: "topic"; topic: TopicFeed }
	| { type: "resource"; resource: TopicFinding }
	| { type: "user"; user: UserSearchResult }

const MAX_TOPIC_SUGGESTIONS = 4
const MAX_RESOURCE_SUGGESTIONS = 6

// how long typing pauses before a user search is sent, so a fast typist spends one request instead of ten
const USER_SEARCH_DEBOUNCE_MS = 200

// how far each arrow key moves the highlight. any other key is left alone
const ARROW_STEP: Record<string, number | undefined> = { ArrowDown: 1, ArrowUp: -1 }

// the ids tying the input to its list and to the highlighted row, which is how a screen reader follows the arrows
const SUGGESTION_LIST_ID = "search-suggestions"
const SUGGESTION_ID_PREFIX = "search-suggestion-"

/**
 * The search bar that overlaps the hero.
 * a search input with a clear button, a typeahead over topics and their findings, and the Filters menu
 */
export function SearchBar() {
	const { topicFeed } = useTopicFeed()
	const navigate = useNavigate()
	const [query, setQuery] = useState("")
	const [isFocused, setFocused] = useState(false)
	// the highlighted suggestion index, or -1 when the user hasn't picked one with the arrow keys
	const [suggestionIndex, setSuggestionIndex] = useState(-1)
	// topics and findings are already loaded, but users are not, so they are searched as the query settles
	const [userMatches, setUserMatches] = useState<UserSearchResult[]>([])
	const [isSearchingUsers, setSearchingUsers] = useState(false)
	// which result kinds the dropdown offers. this state is the search bar's own, since it narrows nothing else
	const [searchResultTypes, setSearchResultTypes] = useState<Set<SearchResultType>>(new Set(SEARCH_RESULT_TYPES))
	const handleToggleSearchResultType = (resultType: SearchResultType): void => {
		setSearchResultTypes((previous) => {
			const next = new Set(previous)
			if (next.has(resultType)) {
				next.delete(resultType)
			} else {
				next.add(resultType)
			}
			return next
		})
	}

	// flatten the loaded topic feed for the typeahead. dedupe topics since one can appear in both Featured and Popular
	const resources = topicFeed
		? topicFeed.sections.flatMap((section) => section.topics.flatMap((topic) => topic.findings))
		: []
	const sectionTopics = topicFeed?.sections.flatMap((section) => section.topics) ?? []
	// use a map to dedupe topics by id
	const topics = [...new Map(sectionTopics.map((topic) => [topic.id, topic])).values()]

	// match topics by name and topic findings by title, or the url when there is no title. cap each list
	const searchQuery = query.trim().toLowerCase()
	const topicMatches = searchQuery
		? topics.filter((topic) => topic.name.toLowerCase().includes(searchQuery)).slice(0, MAX_TOPIC_SUGGESTIONS)
		: []
	const resourceMatches = searchQuery
		? resources
				.filter((resource) => (resource.title ?? resource.url).toLowerCase().includes(searchQuery))
				.slice(0, MAX_RESOURCE_SUGGESTIONS)
		: []

	// search for users once the typing settles. isCurrent drops a reply that the query has already moved past,
	// so two searches returning out of order won't leave the older list showing.
	// isSearchingUsers keeps the empty state quiet until the reply lands, because users arrive after topics and findings
	useEffect(() => {
		// a filtered-out profile row is never rendered, so there is nothing to spend a request on
		if (!searchResultTypes.has("profiles") || searchQuery.length < USER_SEARCH_MIN_CHARS) {
			setUserMatches([])
			setSearchingUsers(false)
			return
		}
		let isCurrent = true
		setSearchingUsers(true)
		const timer = setTimeout(() => {
			searchUsers(searchQuery)
				.catch(() => [])
				.then((users) => {
					if (isCurrent) {
						setUserMatches(users)
						setSearchingUsers(false)
					}
				})
		}, USER_SEARCH_DEBOUNCE_MS)
		return () => {
			isCurrent = false
			clearTimeout(timer)
		}
	}, [searchQuery, searchResultTypes])

	// topics, then users, then findings, so the arrow keys walk one combined list
	const searchSuggestions: SearchResultSuggestion[] = [
		...(searchResultTypes.has("topics") ? topicMatches.map((topic) => ({ type: "topic" as const, topic })) : []),
		...userMatches.map((user) => ({ type: "user" as const, user })),
		...(searchResultTypes.has("findings")
			? resourceMatches.map((resource) => ({ type: "resource" as const, resource }))
			: []),
	]

	// the dropdown shows while the input is focused and has a query
	const showDropdown = isFocused && searchQuery.length > 0

	// a row carries its own href, so a mouse click never reaches openSuggestion. both paths clear through here
	const handleClearSearch = (): void => {
		setQuery("")
		setSuggestionIndex(-1)
	}

	// open the topic or profile page or the resource in a new tab, then clear the search
	const openSuggestion = (suggestion: SearchResultSuggestion): void => {
		if (suggestion.type === "topic") {
			navigate(`/topics/${suggestion.topic.id}`)
		} else if (suggestion.type === "user") {
			navigate(`/profiles/${suggestion.user.userId}`)
		} else {
			void sendTopicFindingOpened(suggestion.resource.findingId)
			window.open(suggestion.resource.url, "_blank", "noopener,noreferrer")
		}
		handleClearSearch()
	}

	// arrow keys move the highlighted topic or resource, enter opens the highlighted suggestion or the only one
	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (!showDropdown) {
			return
		}
		// an arrow key moves the highlight and stays inside the list
		const step = ARROW_STEP[event.key]
		if (step) {
			event.preventDefault()
			setSuggestionIndex((index) => clampSuggestionIndex(index + step, searchSuggestions.length))
			return
		}
		// enter opens the highlighted suggestion, falling back to the only one if nothing is highlighted
		if (event.key === "Enter") {
			const target = searchSuggestions[suggestionIndex] ?? findOnlySuggestion(searchSuggestions)
			if (target) {
				event.preventDefault()
				openSuggestion(target)
			}
		}
	}

	return (
		<div className="relative">
			<div className="bg-card border-border flex items-center gap-2 rounded-lg border py-2 pr-2 pl-3 shadow-lift">
				{/* the magnifying glass, then the search input. blur is delayed so a click on a result lands before the dropdown hides */}
				<Search className="text-muted-foreground size-4 shrink-0" />
				<Input
					value={query}
					onChange={(event) => {
						setQuery(event.target.value)
						setSuggestionIndex(-1)
					}}
					onFocus={() => setFocused(true)}
					onBlur={() => setTimeout(() => setFocused(false), 120)}
					onKeyDown={handleKeyDown}
					role="combobox"
					aria-expanded={showDropdown}
					aria-controls={showDropdown ? SUGGESTION_LIST_ID : undefined}
					aria-autocomplete="list"
					aria-activedescendant={suggestionIndex >= 0 ? `${SUGGESTION_ID_PREFIX}${suggestionIndex}` : undefined}
					aria-label="Search topics, findings and users"
					placeholder="Search topics, findings and users…"
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
				<div className="bg-border h-6 w-px shrink-0" />
				<SearchFilters searchResultTypes={searchResultTypes} onToggleSearchResultType={handleToggleSearchResultType} />
			</div>
			{/* the typeahead dropdown, one row per suggestion, highlighted when the arrow keys land on it */}
			{showDropdown && (
				<div
					id={SUGGESTION_LIST_ID}
					role="listbox"
					aria-label="Search suggestions"
					className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border p-1 shadow-lift"
				>
					{searchSuggestions.map((suggestion, index) => {
						// the id the input points aria-activedescendant at, so the arrow highlight is announced
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
					{/* empty state, withheld while the user search is still pending */}
					{searchSuggestions.length === 0 && !isSearchingUsers && (
						<p className="text-muted-foreground px-2 py-3 text-sm">No matches found.</p>
					)}
				</div>
			)}
		</div>
	)
}

// keep the highlight inside the list. arrowing up from nothing highlighted lands on the first row
function clampSuggestionIndex(index: number, suggestionCount: number): number {
	return Math.max(0, Math.min(index, suggestionCount - 1))
}

// the lone suggestion when the list has exactly one, so enter can open it without arrowing to it first
function findOnlySuggestion(searchSuggestions: SearchResultSuggestion[]): SearchResultSuggestion | undefined {
	return searchSuggestions.length === 1 ? searchSuggestions[0] : undefined
}
