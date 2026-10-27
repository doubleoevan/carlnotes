import type { ComponentType, ReactNode } from "react"

export type ScrollDownButtonElements = {
	Button: ComponentType<{ children: ReactNode; onPress: () => void; label: string; className: string }>
	ArrowDown: ComponentType
}

/**
 * Shows a centered action for returning to the latest chat message.
 */
export function ScrollDownButton({
	isScrollDownShown,
	onScrollDown,
	elements: { Button, ArrowDown },
}: {
	isScrollDownShown: boolean
	onScrollDown: () => void
	elements: ScrollDownButtonElements
}) {
	if (!isScrollDownShown) {
		return null
	}
	return (
		<Button
			onPress={onScrollDown}
			label="Jump to the latest message"
			className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-card text-foreground shadow-raised"
		>
			<ArrowDown />
		</Button>
	)
}
