import { type MoreButtonComponents, MoreButton as SharedMoreButton } from "@carlnotes/core/components/MoreButton"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

// the web's in-place finding-list toggle
type MoreButtonProps = { isExpanded: boolean; moreCount: number; moreLabel?: string; onToggle: () => void }

/**
 * Expands or collapses a finding list with the web's label, arrow, and inset.
 */
export function MoreButton({ isExpanded, moreCount, moreLabel, onToggle }: MoreButtonProps) {
	return (
		<SharedMoreButton
			isExpanded={isExpanded}
			moreLabel={moreLabel ?? `+ ${moreCount} more`}
			onToggle={onToggle}
			components={MORE_BUTTON_COMPONENTS}
		/>
	)
}

// native text keeps the arrow outside the pressed label's underline
const MORE_BUTTON_COMPONENTS: MoreButtonComponents = {
	Button: ({ label, isExpanded, onPress, children }) => (
		<Button
			variant="link"
			size="sm"
			className="mt-1 mb-2 min-h-11 self-start justify-start pl-9 pr-0"
			accessibilityLabel={label}
			accessibilityState={{ expanded: isExpanded }}
			onPress={onPress}
		>
			{children}
		</Button>
	),
	Label: ({ children }) => <Text>{children}</Text>,
	Arrow: ({ isExpanded }) => (
		<Text
			className="text-lg no-underline"
			style={{ transform: [{ rotate: isExpanded ? "180deg" : "0deg" }] }}
			accessible={false}
		>
			▾
		</Text>
	),
}
