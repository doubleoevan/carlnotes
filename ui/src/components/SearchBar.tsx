import type { TopicFeed, TopicFinding } from "@shared/contracts"
import { Hash, Search, X } from "lucide-react"
import { type KeyboardEvent, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnchorLink } from "@/components/AnchorLink"
import { Input } from "@/components/primitives/input"
import { SearchFilters } from "@/components/SearchFilters.tsx"
import { sendTopicFindingOpened } from "@/lib/topicFeedClient"
import { cn, RESOURCE_KIND_ICON } from "@/lib/utils"
import { useTopicFeed } from "@/providers/TopicFeedProvider"

// a single typeahead suggestion, either a topic or a topic finding resource
type Suggestion = { type: "topic"; topic: TopicFeed } | { type: "resource"; resource: TopicFinding }

const MAX_TOPIC_SUGGESTIONS = 4
const MAX_RESOURCE_SUGGESTIONS = 6

// how far each arrow key moves the highlight. any other key is left alone
const ARROW_STEP: Record<string, number | undefined> = { ArrowDown: 1, ArrowUp: -1 }

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

	// topics first, then resources, so the arrow keys walk one combined list
	const suggestions: Suggestion[] = [
		...topicMatches.map((topic) => ({ type: "topic" as const, topic })),
		...resourceMatches.map((resource) => ({ type: "resource" as const, resource })),
	]

	// the dropdown shows while the input is focused and has a query
	const showDropdown = isFocused && searchQuery.length > 0

	// open the topic page or the resource in a new tab, then clear the search
	const openSuggestion = (suggestion: Suggestion): void => {
		if (suggestion.type === "topic") {
			navigate(`/topics/${suggestion.topic.id}`)
		} else {
			void sendTopicFindingOpened(suggestion.resource.findingId)
			window.open(suggestion.resource.url, "_blank", "noopener,noreferrer")
		}
		setQuery("")
		setSuggestionIndex(-1)
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
			setSuggestionIndex((index) => clampSuggestionIndex(index + step, suggestions.length))
			return
		}
		// enter opens the highlighted suggestion, falling back to the only one when nothing is highlighted
		if (event.key === "Enter") {
			const target = suggestions[suggestionIndex] ?? onlySuggestion(suggestions)
			if (target) {
				event.preventDefault()
				openSuggestion(target)
			}
		}
	}

	return (
		<div className="relative">
			<div className="bg-card border-border flex items-center gap-2 rounded-lg border py-2 pr-2 pl-3 shadow-sm">
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
					aria-label="Search topics and notes"
					placeholder="Search topics and notes…"
					className="h-11 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 sm:h-9 dark:bg-transparent"
				/>
				{/* clear button, shown when there's a query */}
				{query && (
					<button
						type="button"
						onClick={() => setQuery("")}
						aria-label="Clear search"
						className="text-muted-foreground hover:text-foreground grid size-8 shrink-0 place-items-center rounded-md"
					>
						{/* clear icon */}
						<X className="size-4" />
					</button>
				)}
				{/* divider, then the Filters dropdown */}
				<div className="bg-border h-6 w-px shrink-0" />
				<SearchFilters />
			</div>
			{/* the typeahead dropdown, one row per suggestion, highlighted when the arrow keys land on it */}
			{showDropdown && (
				<div className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border p-1 shadow-md">
					{suggestions.map((suggestion, index) =>
						suggestion.type === "topic" ? (
							<TopicResult
								key={`topic-${suggestion.topic.id}`}
								topic={suggestion.topic}
								isActive={index === suggestionIndex}
							/>
						) : (
							<ResourceResult
								key={`resource-${suggestion.resource.findingId}`}
								resource={suggestion.resource}
								isActive={index === suggestionIndex}
							/>
						),
					)}
					{/* empty state when nothing matches */}
					{suggestions.length === 0 && <p className="text-muted-foreground px-2 py-3 text-sm">No matches found.</p>}
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
function onlySuggestion(suggestions: Suggestion[]): Suggestion | undefined {
	return suggestions.length === 1 ? suggestions[0] : undefined
}

// a topic result with a topic icon and name that links to the topic page. isActive marks the arrow-key highlight
function TopicResult({ topic, isActive }: { topic: TopicFeed; isActive: boolean }) {
	return (
		<AnchorLink
			href={`/topics/${topic.id}`}
			className={cn("hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-2 text-sm", isActive && "bg-accent")}
		>
			<Hash className="text-muted-foreground size-4 shrink-0" aria-label="Topic" />
			<span className="min-w-0 flex-1 truncate">{topic.name}</span>
			<span className="text-muted-foreground shrink-0 text-xs">Topic</span>
		</AnchorLink>
	)
}

// a resource result with a resource kind icon, title, and source that opens the resource in a new tab and records a view
function ResourceResult({ resource, isActive }: { resource: TopicFinding; isActive: boolean }) {
	const Icon = RESOURCE_KIND_ICON[resource.resourceKind]
	return (
		<AnchorLink
			href={resource.url}
			onClick={() => sendTopicFindingOpened(resource.findingId)}
			className={cn("hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-2 text-sm", isActive && "bg-accent")}
		>
			<Icon className="text-muted-foreground size-4 shrink-0" aria-label={resource.resourceKind} />
			<span className="min-w-0 flex-1 truncate">{resource.title ?? resource.url}</span>
			<span className="text-muted-foreground shrink-0 text-xs">{resource.source}</span>
		</AnchorLink>
	)
}
