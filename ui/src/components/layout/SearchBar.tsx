import type { TopicFeed, TopicFinding } from "@shared/contracts"
import { resourceKinds as allResourceKinds } from "@shared/enums"
import { Check, Hash, Search, SlidersHorizontal, X } from "lucide-react"
import { type KeyboardEvent, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnchorLink } from "@/components/layout/AnchorLink"
import { Input } from "@/components/primitives/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { authClient } from "@/lib/authClient"
import { sendTopicFindingOpened } from "@/lib/topicClient"
import { cn, FEED_VIEWS, RESOURCE_KIND_ICON } from "@/lib/utils"
import { type ResourceKind, useTopicFeed } from "@/providers/TopicFeedProvider"

// a single typeahead suggestion, either a topic or a topic finding resource
type SearchResultSuggestion = { type: "topic"; topic: TopicFeed } | { type: "resource"; resource: TopicFinding }

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
	const suggestions: SearchResultSuggestion[] = [
		...topicMatches.map((topic) => ({ type: "topic" as const, topic })),
		...resourceMatches.map((resource) => ({ type: "resource" as const, resource })),
	]

	// the dropdown shows while the input is focused and has a query
	const showDropdown = isFocused && searchQuery.length > 0

	// open the topic page or the resource in a new tab, then clear the search
	const openSuggestion = (suggestion: SearchResultSuggestion): void => {
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
		// enter opens the highlighted suggestion, falling back to the only one if nothing is highlighted
		if (event.key === "Enter") {
			const target = suggestions[suggestionIndex] ?? findOnlySuggestion(suggestions)
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
					aria-label="Search topics and findings"
					placeholder="Search topics and findings…"
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
function findOnlySuggestion(suggestions: SearchResultSuggestion[]): SearchResultSuggestion | undefined {
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

// the Filters dropdown at the end of the search bar: the All / Unread / Bookmarked view on top as radios,
// then which resource kinds appear in the topic feed as checks. Bookmarks belong to a signed-in user, so that view needs a session
function SearchFilters() {
	// the view and resource kind filters live in the topic feed context, shared by both feed surfaces
	const { resourceKinds, toggleResourceKind, view, setView } = useTopicFeed()
	const { data: session } = authClient.useSession()
	const viewOptions = FEED_VIEWS.filter((viewOption) => viewOption !== "bookmarked" || Boolean(session))
	// controlled so picking a view closes the menu, since exactly one view is ever active. resource kind
	// checks below leave the menu open, since several of those can be toggled in a row
	const [isOpen, setIsOpen] = useState(false)
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger
				className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm sm:min-h-9"
				aria-label="Filters"
			>
				<SlidersHorizontal className="size-4" />
				Filters
			</PopoverTrigger>
			{/* the trigger sits inset in the search bar's padded row, not flush with its own border. the offsets
			    cancel that inset so the gap matches Tag Filters' */}
			<PopoverContent align="end" alignOffset={-9} sideOffset={13} className="w-44 p-1">
				{/* one view is active at a time, so its rows are radios. the kinds below the divider are checks */}
				<div role="radiogroup" aria-label="View">
					{viewOptions.map((viewOption) => (
						<ViewRow
							key={viewOption}
							label={viewOption}
							isActive={view === viewOption}
							onChange={() => {
								setView(viewOption)
								setIsOpen(false)
							}}
						/>
					))}
				</div>
				<hr className="border-border my-1" />
				{allResourceKinds.map((resourceKind) => (
					<ResourceKindFilter
						key={resourceKind}
						resourceKind={resourceKind}
						isActive={resourceKinds.has(resourceKind)}
						onClick={() => toggleResourceKind(resourceKind)}
					/>
				))}
			</PopoverContent>
		</Popover>
	)
}

// one view row. a screen-reader-only radio input carries the keyboard and accessibility semantics, and a custom dot renders beside it
function ViewRow({ label, isActive, onChange }: { label: string; isActive: boolean; onChange: () => void }) {
	return (
		<label className="hover:bg-accent flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm sm:min-h-9">
			{/* the input carries the semantics but renders nothing, so the custom dot shows its keyboard focus */}
			<input type="radio" name="feed-view" checked={isActive} onChange={onChange} className="peer sr-only" />
			<span className="border-muted-foreground peer-focus-visible:ring-ring/50 grid size-4 place-items-center rounded-full border peer-focus-visible:ring-[3px]">
				{isActive ? <span className="bg-primary size-2 rounded-full" /> : null}
			</span>
			<span className="flex-1 text-left capitalize">{label}</span>
		</label>
	)
}

// a clickable filter row with the resource kind's shared icon and a check mark when active
type ResourceKindFilterProps = { resourceKind: ResourceKind; isActive: boolean; onClick: () => void }
function ResourceKindFilter({ resourceKind, isActive, onClick }: ResourceKindFilterProps) {
	const Icon = RESOURCE_KIND_ICON[resourceKind]
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={isActive}
			className="hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm sm:min-h-9"
		>
			<Icon className="text-muted-foreground size-4" />
			<span className="flex-1 text-left capitalize">{resourceKind}</span>
			{isActive ? <Check className="size-4" /> : null}
		</button>
	)
}
