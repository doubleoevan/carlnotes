import type { UpdatesMinutes } from "@carlnotes/contracts/updates"
import {
	UpdatesButton as SharedUpdatesButton,
	type UpdatesButtonElements,
} from "@carlnotes/core/components/UpdatesButton"
import { Check, RotateCcwClock } from "lucide-react-native"
import { type ComponentRef, useRef } from "react"
import type { View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

// the native elements of the shared control: a sheet of lengths, with the shown length marked like the feed's sort
const UPDATES_BUTTON_ELEMENTS: UpdatesButtonElements = {
	Menu: function UpdatesMenu({ label, isOpen, onOpenChange, children }) {
		const triggerRef = useRef<ComponentRef<typeof View>>(null)
		return (
			<>
				<Button ref={triggerRef} variant="outline" accessibilityLabel={label} onPress={() => onOpenChange(true)}>
					<Icon as={RotateCcwClock} className="size-4" />
					<Text>{label}</Text>
				</Button>
				{isOpen ? (
					<Sheet title={label} triggerRef={triggerRef} onClose={() => onOpenChange(false)}>
						{children}
					</Sheet>
				) : null}
			</>
		)
	},
	Option: ({ isSelected, onSelect, children }) => (
		<Button
			variant={isSelected ? "secondary" : "ghost"}
			className="min-h-12 justify-start"
			accessibilityLabel={String(children)}
			accessibilityState={{ selected: isSelected }}
			onPress={onSelect}
		>
			<Text className="flex-1 text-left">{children}</Text>
			{isSelected ? <Icon as={Check} /> : null}
		</Button>
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
