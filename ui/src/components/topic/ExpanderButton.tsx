import { Button } from "@/components/primitives/button"

// the "+ # more / show less" toggle shared by the topic page's findings and history sections
export function ExpanderButton({
	isExpanded,
	moreLabel,
	onToggle,
}: {
	isExpanded: boolean
	moreLabel: string
	onToggle: () => void
}) {
	return (
		<Button
			variant="link"
			size="sm"
			onClick={onToggle}
			className="group text-link mt-1 h-auto min-h-11 justify-start pr-0 pl-4 hover:no-underline sm:min-h-9"
		>
			{/* the label carries the underline on hover, the larger arrow stays outside it so the line is not stepped */}
			<span className="underline-offset-4 group-hover:underline">{isExpanded ? "show less " : moreLabel}</span>
			<span className="text-lg leading-none">{isExpanded ? "▴" : "▾"}</span>
		</Button>
	)
}
