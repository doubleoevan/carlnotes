import { resourceKinds as allResourceKinds } from "@shared/enums"
import {
	Ban,
	Blend,
	Check,
	CircleUserRound,
	CircleX,
	FileText,
	Hash,
	type LucideIcon,
	SlidersHorizontal,
	Target,
	Users,
} from "lucide-react"
import { Fragment, useState } from "react"
import { authClient } from "@/clients/authClient"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS, SEARCH_BAR_ICON_CLASS } from "@/lib/styleClasses"
import { TOPIC_FINDING_FILTERS } from "@/lib/topicFindingFilters"
import { cn, RESOURCE_KIND_ICON } from "@/lib/utils"
import { type ResourceKind, type TagMatchMode, tagMatchModes, useTopicFeed } from "@/providers/TopicFeedProvider"
import { usePageActions } from "@/stores/pageActionsStore"

// which kinds of results the typeahead offers, all on until the user turns one off
export const SEARCH_RESULT_TYPES = ["topics", "findings", "teams", "users"] as const
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number]

// how the selected tags narrow the feed, one mode at a time
const TAG_MATCH_OPTIONS: Record<TagMatchMode, { label: string; Icon: LucideIcon }> = {
	any: { label: "Any Match", Icon: Blend },
	all: { label: "All Match", Icon: Target },
	none: { label: "Exclude Tags", Icon: Ban },
	off: { label: "Off", Icon: CircleX },
}

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
	// the finding, resource kind, and tag filters live in the topic feed context, shared by the home page and the topic page
	const {
		resourceKinds,
		toggleResourceKind,
		findingFilter,
		setFindingFilter,
		tagMatchMode,
		setTagMatchMode,
		bookmarkScope,
		setBookmarkScope,
		hasTopicFeed,
	} = useTopicFeed()
	// a team topic's page supports team bookmark filtering
	const hasTeamBookmarks = Boolean(usePageActions()?.hasTeamBookmarks)
	const { data: session } = authClient.useSession()
	const topicFindingFilterOptions = TOPIC_FINDING_FILTERS.filter(
		(filterOption) => filterOption !== "bookmarked" || Boolean(session),
	)
	// the dropdown is controlled so selecting an option closes the menu
	const [isOpen, setIsOpen] = useState(false)
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<Tooltip>
				{/* the span keeps the tooltip and the popover from both controlling the trigger's state */}
				<TooltipTrigger asChild>
					<span className="inline-flex">
						<PopoverTrigger className={SEARCH_BAR_ICON_CLASS} aria-label="Filters">
							<SlidersHorizontal className="size-4" />
						</PopoverTrigger>
					</span>
				</TooltipTrigger>
				<TooltipContent>Filters</TooltipContent>
			</Tooltip>
			{/* the trigger sits inset in the search bar's padded row.
			    the offsets cancel that inset and align the menu with the search bar's edge */}
			<PopoverContent align="end" alignOffset={-9} sideOffset={13} className="w-44" bodyClassName="p-1">
				{/* the resource kind, view, and tag filters all narrow topic scan findings.
				    a page without a topic feed hides them */}
				{hasTopicFeed && (
					<>
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
							{topicFindingFilterOptions.map((filterOption) =>
								// a team topic splits the bookmarked filter in two: the user's own bookmarks filter, or the team's
								filterOption === "bookmarked" && hasTeamBookmarks ? (
									<Fragment key={filterOption}>
										<RadioRow
											radioGroupName="feed-findingFilter"
											label="My bookmarked"
											isActive={findingFilter === "bookmarked" && bookmarkScope === "mine"}
											onChange={() => {
												setFindingFilter("bookmarked")
												setBookmarkScope("mine")
												setIsOpen(false)
											}}
										/>
										<RadioRow
											radioGroupName="feed-findingFilter"
											label="Team bookmarked"
											isActive={findingFilter === "bookmarked" && bookmarkScope === "team"}
											onChange={() => {
												setFindingFilter("bookmarked")
												setBookmarkScope("team")
												setIsOpen(false)
											}}
										/>
									</Fragment>
								) : (
									<RadioRow
										key={filterOption}
										radioGroupName="feed-findingFilter"
										label={filterOption}
										isActive={findingFilter === filterOption}
										onChange={() => {
											setFindingFilter(filterOption)
											setIsOpen(false)
										}}
									/>
								),
							)}
						</div>
						<hr className="border-border my-1" />
						{/* how the tags selected on the home page filter, one mode at a time */}
						<div role="radiogroup" aria-label="Tags">
							<div className="text-muted-foreground px-2 py-1 text-xs">Tags</div>
							{tagMatchModes.map((matchMode) => (
								<RadioRow
									key={matchMode}
									radioGroupName="tag-match"
									label={TAG_MATCH_OPTIONS[matchMode].label}
									Icon={TAG_MATCH_OPTIONS[matchMode].Icon}
									isActive={tagMatchMode === matchMode}
									onChange={() => {
										setTagMatchMode(matchMode)
										setIsOpen(false)
									}}
								/>
							))}
						</div>
						<hr className="border-border my-1" />
					</>
				)}
				{/* a fieldset. its rows announce under the "Search for" label as one group */}
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

// one select-one radio row used by the topic finding and the tag match filters
function RadioRow({
	radioGroupName,
	label,
	Icon,
	isActive,
	onChange,
}: {
	// the radio group this option belongs to. the topic finding and the tag match filters use separate groups
	radioGroupName: string
	label: string
	// the leading icon a tag match option shows. the topic finding options have none
	Icon?: LucideIcon
	isActive: boolean
	onChange: () => void
}) {
	return (
		<label className={cn(MENU_OPTION_CLASS, "cursor-pointer", isActive && MENU_OPTION_SELECTED_CLASS)}>
			{/* the radio input is screen-reader only. the custom dot shows its keyboard focus */}
			<input type="radio" name={radioGroupName} checked={isActive} onChange={onChange} className="peer sr-only" />
			<span className="border-muted-foreground peer-focus-visible:ring-ring/50 grid size-4 place-items-center rounded-full border peer-focus-visible:ring-[3px]">
				{isActive ? <span className="bg-primary size-2 rounded-full" /> : null}
			</span>
			{Icon ? <Icon className="text-muted-foreground size-4" /> : null}
			<span className="flex-1 text-left capitalize">{label}</span>
		</label>
	)
}

// the icon mapped to each kind of search result
const SEARCH_RESULT_TYPE_ICON: Record<SearchResultType, LucideIcon> = {
	topics: Hash,
	findings: FileText,
	teams: Users,
	users: CircleUserRound,
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
			className={cn(MENU_OPTION_CLASS, isActive && MENU_OPTION_SELECTED_CLASS)}
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
			className={cn(MENU_OPTION_CLASS, isActive && MENU_OPTION_SELECTED_CLASS)}
		>
			<Icon className="text-muted-foreground size-4" />
			<span className="flex-1 text-left capitalize">{resourceKind}</span>
			{isActive ? <Check className="size-4" /> : null}
		</button>
	)
}
