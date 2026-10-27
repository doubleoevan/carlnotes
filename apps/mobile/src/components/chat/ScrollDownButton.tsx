import {
	type ScrollDownButtonElements,
	ScrollDownButton as SharedScrollDownButton,
} from "@carlnotes/core/components/ScrollDownButton"
import { ArrowDown } from "lucide-react-native"
import type { ComponentProps } from "react"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"

/**
 * Adapts the shared latest-message action to native touch controls.
 */
export function ScrollDownButton(props: Omit<ComponentProps<typeof SharedScrollDownButton>, "elements">) {
	return <SharedScrollDownButton {...props} elements={SCROLL_DOWN_BUTTON_ELEMENTS} />
}

// the native button supplies the platform's minimum touch target
const SCROLL_DOWN_BUTTON_ELEMENTS: ScrollDownButtonElements = {
	Button: ({ children, onPress, label, className }) => (
		<Button accessibilityLabel={label} onPress={onPress} variant="outline" size="icon-sm" className={className}>
			{children}
		</Button>
	),
	ArrowDown: () => <Icon as={ArrowDown} className="size-4" />,
}
