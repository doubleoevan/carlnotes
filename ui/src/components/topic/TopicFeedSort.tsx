import { ArrowUpDown, Check, Clock, Flame, type LucideIcon, Target } from "lucide-react"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SEARCH_BAR_ICON_CLASS } from "@/lib/styleClasses"
import { TOPIC_FINDING_SORTS, type TopicFindingSort } from "@/lib/topicFindingSorts"
import { useTopicFeed } from "@/providers/TopicFeedProvider"

// each sort mode's display label and icon
const SORT_OPTIONS: Record<TopicFindingSort, { label: string; Icon: LucideIcon }> = {
	relevant: { label: "Relevance", Icon: Target },
	newest: { label: "Newest", Icon: Clock },
	trending: { label: "Trending", Icon: Flame },
}

/**
 * The Sort menu at the end of the search bar, beside Filters: the relevant / newest / trending modes.
 * Selecting a mode closes the menu, and exactly one mode is ever active.
 */
export function TopicFeedSort() {
	// the sort lives in the topic feed context, shared by the home page and the topic page
	const { sort, setSort, hasTopicFeed } = useTopicFeed()
	const [isOpen, setIsOpen] = useState(false)
	// a page with no findings has nothing to order, so the control leaves the bar rather than sitting inert
	if (!hasTopicFeed) {
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
			<PopoverContent align="end" sideOffset={13} className="w-40 p-1">
				{/* one row per sort mode with a check on the active one */}
				{TOPIC_FINDING_SORTS.map((sortOption) => {
					const { label, Icon } = SORT_OPTIONS[sortOption]
					return (
						<button
							key={sortOption}
							type="button"
							onClick={() => {
								setSort(sortOption)
								setIsOpen(false)
							}}
							aria-pressed={sortOption === sort}
							className="hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm sm:min-h-9"
						>
							<Icon className="size-4 text-muted-foreground" />
							<span className="flex-1 text-left">{label}</span>
							{sortOption === sort ? <Check className="size-4" /> : null}
						</button>
					)
				})}
			</PopoverContent>
		</Popover>
	)
}
