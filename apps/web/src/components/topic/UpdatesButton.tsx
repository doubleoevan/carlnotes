import type { UpdatesMinutes } from "@carlnotes/contracts/updates"
import {
	UpdatesButton as SharedUpdatesButton,
	type UpdatesButtonElements,
} from "@carlnotes/core/components/UpdatesButton"
import { cn } from "@carlnotes/nightshift/classNames"
import { RotateCcwClock } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import {
	MENU_BUTTON_CLASS,
	MENU_BUTTON_HIGHLIGHT_CLASS,
	MENU_OPTION_CLASS,
	MENU_OPTION_SELECTED_CLASS,
} from "@/lib/styleClasses"

// the browser elements of the shared control: a popover of lengths, with the shown length highlighted
const UPDATES_BUTTON_ELEMENTS: UpdatesButtonElements = {
	Menu: ({ label, isOpen, onOpenChange, children }) => (
		<Popover open={isOpen} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<button type="button" className={cn(MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS)}>
					<RotateCcwClock className="size-4" />
					{label}
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-40" bodyClassName="p-1">
				{children}
			</PopoverContent>
		</Popover>
	),
	Option: ({ isSelected, onSelect, children }) => (
		<button
			type="button"
			aria-current={isSelected ? "true" : undefined}
			className={cn(MENU_OPTION_CLASS, isSelected && MENU_OPTION_SELECTED_CLASS)}
			onClick={onSelect}
		>
			{children}
		</button>
	),
}

/**
 * The Update button at the top of the card, whose lengths load a new list.
 */
export function UpdatesButton({
	minutes,
	onSelect,
}: {
	minutes: UpdatesMinutes
	onSelect: (minutes: UpdatesMinutes) => void
}) {
	return <SharedUpdatesButton elements={UPDATES_BUTTON_ELEMENTS} minutes={minutes} onSelect={onSelect} />
}
