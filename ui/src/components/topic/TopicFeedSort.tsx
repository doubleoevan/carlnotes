import { ArrowUpDown, Check } from "lucide-react"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { FINDING_SORTS, type FindingSort, MENU_BUTTON_CLASS } from "@/lib/utils"

// each mode's display label
const SORT_LABELS: Record<FindingSort, string> = { relevant: "Relevance", newest: "Newest", trending: "Trending" }

/**
 * The Sort menu: a button matching the Tag Filters control, opening the relevant / newest / trending modes.
 * Picking a mode closes the menu, since exactly one mode is ever active.
 */
export function TopicFeedSort({ sort, onChange }: { sort: FindingSort; onChange: (sort: FindingSort) => void }) {
	const [isOpen, setIsOpen] = useState(false)
	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger className={MENU_BUTTON_CLASS}>
				<ArrowUpDown className="size-4" />
				Sort
			</PopoverTrigger>
			<PopoverContent align="start" className="w-40 p-1">
				{/* one row per sort mode with a check on the active one */}
				{FINDING_SORTS.map((sortOption) => (
					<button
						key={sortOption}
						type="button"
						onClick={() => {
							onChange(sortOption)
							setIsOpen(false)
						}}
						aria-pressed={sortOption === sort}
						className="hover:bg-accent flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm sm:min-h-9"
					>
						<span className="flex-1 text-left">{SORT_LABELS[sortOption]}</span>
						{sortOption === sort ? <Check className="size-4" /> : null}
					</button>
				))}
			</PopoverContent>
		</Popover>
	)
}
