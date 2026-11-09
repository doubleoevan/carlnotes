import { UPDATES_MINUTES, type UpdatesMinutes } from "@carlnotes/contracts/updates"
import { type ComponentType, type ReactNode, useState } from "react"
import { useTopicUpdates } from "../hooks/useUpdates"

// the button's label
const UPDATE_LABEL = "Update"

// the control opens a menu of its lengths, in a popover on the web and a sheet on a phone
export type UpdatesButtonElements = {
	Menu: ComponentType<{ label: string; isOpen: boolean; onOpenChange: (isOpen: boolean) => void; children: ReactNode }>
	Option: ComponentType<{ isSelected: boolean; onSelect: () => void; children: ReactNode }>
}

/**
 * Offers a list's lengths, shortest first, with the shown list's length selected. Each choice forgets that length's
 * list, so it requests a new one.
 */
export function UpdatesButton({
	elements: { Menu, Option },
	minutes,
	onSelect,
}: {
	elements: UpdatesButtonElements
	// the length of the list on screen
	minutes: UpdatesMinutes
	onSelect: (minutes: UpdatesMinutes) => void
}) {
	const [isOpen, setIsOpen] = useState(false)
	const refreshUpdates = useTopicUpdates()
	return (
		<Menu label={UPDATE_LABEL} isOpen={isOpen} onOpenChange={setIsOpen}>
			{UPDATES_MINUTES.map((optionMinutes) => (
				<Option
					key={optionMinutes}
					isSelected={optionMinutes === minutes}
					onSelect={() => {
						setIsOpen(false)
						refreshUpdates(optionMinutes)
						onSelect(optionMinutes)
					}}
				>
					{`${optionMinutes} minutes`}
				</Option>
			))}
		</Menu>
	)
}
