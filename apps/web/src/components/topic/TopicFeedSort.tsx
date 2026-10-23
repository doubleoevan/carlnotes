import { TOPIC_FINDING_SORTS, type TopicFindingSort } from "@carlnotes/contracts/findings"
import { ArrowUpDown, Check, Clock, Flame, type LucideIcon, Target } from "lucide-react"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS, SEARCH_BAR_ICON_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { useOptionalTopicFeed } from "@/providers/TopicFeedProvider"

// each sort mode's display label and icon
const SORT_OPTIONS: Record<TopicFindingSort, { label: string; Icon: LucideIcon }> = {
	relevant: { label: "Relevance", Icon: Target },
	newest: { label: "Newest", Icon: Clock },
	trending: { label: "Trending", Icon: Flame },
}

/**
 * The Sort menu at the end of the search bar, beside Filters: the relevant / newest / trending modes.
 * Selecting a mode closes the menu, and exactly one mode is ever active. Given a search sort, it sorts the search page
 * or a search card in place of the topic feed.
 */
export function TopicFeedSort({
	searchSort,
}: {
	searchSort?: { sort: TopicFindingSort; onSort: (sort: TopicFindingSort) => void }
}) {
	// the sort lives in the topic feed context, unless a search holds it: the search page's url or a search card's
	const topicFeed = useOptionalTopicFeed()
	const [isOpen, setIsOpen] = useState(false)
	const sort = searchSort?.sort ?? topicFeed?.sort
	const setSort = searchSort?.onSort ?? topicFeed?.setSort
	// a page with no findings and no search hides the control
	if (!sort || !setSort || (!topicFeed?.hasTopicFeed && !searchSort)) {
		return null
	}
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<Tooltip>
				{/* the span keeps the tooltip and the popover from both writing the trigger's state */}
				<TooltipTrigger asChild>
					<span className="inline-flex">
						<PopoverTrigger className={SEARCH_BAR_ICON_CLASS} aria-label="Sort">
							<ArrowUpDown className="size-4" />
						</PopoverTrigger>
					</span>
				</TooltipTrigger>
				<TooltipContent>Sort</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" sideOffset={13} className="w-40" bodyClassName="p-1">
				<TopicFeedSortOptions
					selectedSort={sort}
					onSelectSort={(sortOption) => {
						setSort(sortOption)
						setIsOpen(false)
					}}
				/>
			</PopoverContent>
		</Popover>
	)
}

/**
 * The sort menu's options, one row per sort mode, with the selected tint and a check on the active one.
 */
export function TopicFeedSortOptions({
	selectedSort,
	onSelectSort,
}: {
	selectedSort: TopicFindingSort
	onSelectSort: (sort: TopicFindingSort) => void
}) {
	return (
		<>
			{TOPIC_FINDING_SORTS.map((sortOption) => {
				const { label, Icon } = SORT_OPTIONS[sortOption]
				return (
					<button
						key={sortOption}
						type="button"
						onClick={() => onSelectSort(sortOption)}
						aria-pressed={sortOption === selectedSort}
						className={cn(MENU_OPTION_CLASS, sortOption === selectedSort && MENU_OPTION_SELECTED_CLASS)}
					>
						<Icon className="size-4 text-muted-foreground" />
						<span className="flex-1 text-left">{label}</span>
						{sortOption === selectedSort ? <Check className="size-4" /> : null}
					</button>
				)
			})}
		</>
	)
}
