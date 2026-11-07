import { type MoreButtonComponents, MoreButton as SharedMoreButton } from "@carlnotes/core/components/MoreButton"
import { cn } from "@carlnotes/nightshift/classNames"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

// the web's in-place list toggle
type MoreButtonProps = {
	isExpanded: boolean
	moreCount?: number
	moreLabel?: string
	lessLabel?: string
	onToggle: () => void
	className?: string
}

/**
 * Expands or collapses a list with the web's label, arrow, and inset.
 */
export function MoreButton({ isExpanded, moreCount = 0, moreLabel, lessLabel, onToggle, className }: MoreButtonProps) {
	return (
		<SharedMoreButton
			isExpanded={isExpanded}
			moreLabel={moreLabel ?? `+ ${moreCount} more`}
			lessLabel={lessLabel}
			onToggle={onToggle}
			className={className}
			components={MORE_BUTTON_COMPONENTS}
		/>
	)
}

// native text keeps the arrow outside the pressed label's underline. the inset centers the + under the column of rank
// numbers, and the left-aligned label keeps a trailing space from moving the +
const MORE_BUTTON_COMPONENTS: MoreButtonComponents = {
	Button: ({ label, isExpanded, onPress, className, children }) => (
		<Button
			variant="link"
			size="sm"
			className={cn("mt-1 mb-2 min-h-11 self-start justify-start pl-4.5 pr-0", className)}
			accessibilityLabel={label}
			accessibilityState={{ expanded: isExpanded }}
			onPress={onPress}
		>
			{children}
		</Button>
	),
	Label: ({ children }) => <Text className="text-left">{children}</Text>,
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
