import type { ComponentType, ReactNode } from "react"

// platform button and text elements preserve their own focus and touch semantics
export type MoreButtonComponents = {
	Button: ComponentType<{
		className?: string
		label: string
		isExpanded: boolean
		onPress: () => void
		children: ReactNode
	}>
	Label: ComponentType<{ children: ReactNode }>
	Arrow: ComponentType<{ isExpanded: boolean; children: ReactNode }>
}

/**
 * Renders the shared expansion label and arrow with a platform button.
 */
export function MoreButton({
	isExpanded,
	moreLabel,
	lessLabel = "show less",
	onToggle,
	className,
	components: { Button, Label, Arrow },
}: {
	isExpanded: boolean
	moreLabel: string
	lessLabel?: string
	className?: string
	onToggle: () => void
	components: MoreButtonComponents
}) {
	const label = isExpanded ? lessLabel : moreLabel
	return (
		<Button className={className} label={label} isExpanded={isExpanded} onPress={onToggle}>
			<Label>{label}</Label>
			<Arrow isExpanded={isExpanded}>{isExpanded ? "▴" : "▾"}</Arrow>
		</Button>
	)
}
