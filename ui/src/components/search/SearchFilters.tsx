import { resourceKinds as allResourceKinds } from "@shared/enums"
import { Check, CircleUserRound, FileText, Hash, type LucideIcon, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { authClient } from "@/lib/authClient"
import { FEED_VIEWS, RESOURCE_KIND_ICON } from "@/lib/utils"
import { type ResourceKind, useTopicFeed } from "@/providers/TopicFeedProvider"

// which kinds of result the typeahead offers, all on until the user turns one off. these narrow the dropdown
// only: topics and findings also answer to the feed's own filters, and a profile never appears in the feed at all
export const SEARCH_RESULT_TYPES = ["topics", "profiles", "findings"] as const
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number]

/**
 * The Filters dropdown at the end of the search bar.
 * The resource kinds to show in the topic feed.
 * The "All / Unread / Bookmarked" filter as radios, and which kinds of search results to show.
 * The "Bookmarked" filter requires a signed-in user session.
 */
export function SearchFilters({
	searchResultTypes,
	onToggleSearchResultType,
}: {
	searchResultTypes: Set<SearchResultType>
	onToggleSearchResultType: (resultType: SearchResultType) => void
}) {
	// the view and resource kind filters live in the topic feed context, shared by the home page and the topic page
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
				{/* the kinds lead as checks, since several can be on at once. the view below the divider is one
				    at a time, so its rows are radios */}
				{allResourceKinds.map((resourceKind) => (
					<ResourceKindFilter
						key={resourceKind}
						resourceKind={resourceKind}
						isActive={resourceKinds.has(resourceKind)}
						onClick={() => toggleResourceKind(resourceKind)}
					/>
				))}
				<hr className="border-border my-1" />
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
				{/* a fieldset, so its rows announce under the "Search for" label as one group */}
				<fieldset aria-labelledby="search-result-type-label">
					<div id="search-result-type-label" className="text-muted-foreground px-2 py-1 text-xs">
						Search for
					</div>
					{SEARCH_RESULT_TYPES.map((resultType) => (
						<SearchResultTypeFilter
							key={resultType}
							resultType={resultType}
							isActive={searchResultTypes.has(resultType)}
							onClick={() => onToggleSearchResultType(resultType)}
						/>
					))}
				</fieldset>
			</PopoverContent>
		</Popover>
	)
}

// one view row. a screen-reader-only radio input includes the keyboard and accessibility semantics, and a custom dot renders beside it
function ViewRow({ label, isActive, onChange }: { label: string; isActive: boolean; onChange: () => void }) {
	return (
		<label className="hover:bg-accent flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm sm:min-h-9">
			{/* the input includes the semantics but renders nothing, so the custom dot shows its keyboard focus */}
			<input type="radio" name="feed-view" checked={isActive} onChange={onChange} className="peer sr-only" />
			<span className="border-muted-foreground peer-focus-visible:ring-ring/50 grid size-4 place-items-center rounded-full border peer-focus-visible:ring-[3px]">
				{isActive ? <span className="bg-primary size-2 rounded-full" /> : null}
			</span>
			<span className="flex-1 text-left capitalize">{label}</span>
		</label>
	)
}

// the icon mapped to each kind of search result
const SEARCH_RESULT_TYPE_ICON: Record<SearchResultType, LucideIcon> = {
	topics: Hash,
	profiles: CircleUserRound,
	findings: FileText,
}

// one clickable search result filter row, checked if active
function SearchResultTypeFilter({
	resultType,
	isActive,
	onClick,
}: {
	resultType: SearchResultType
	isActive: boolean
	onClick: () => void
}) {
	const Icon = SEARCH_RESULT_TYPE_ICON[resultType]
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={isActive}
			className="hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm sm:min-h-9"
		>
			<Icon className="text-muted-foreground size-4" />
			<span className="flex-1 text-left capitalize">{resultType}</span>
			{isActive ? <Check className="size-4" /> : null}
		</button>
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
