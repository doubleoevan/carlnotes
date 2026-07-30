import { Button } from "@/components/primitives/button"
import { cn } from "@/lib/utils"

// the "+ # more / show less" toggle shared by the topic feed and the topic page's findings and history sections.
// className gets used to set the left padding, since each surface indents its rows differently
export function MoreButton({
	isExpanded,
	moreLabel,
	onToggle,
	className,
}: {
	isExpanded: boolean
	moreLabel: string
	onToggle: () => void
	className?: string
}) {
	return (
		<Button
			variant="link"
			size="sm"
			onClick={onToggle}
			className={cn(
				"group text-link mt-1 h-auto min-h-11 justify-start pr-0 pl-9 hover:no-underline sm:min-h-9",
				className,
			)}
		>
			{/* the label carries the underline on hover, the larger arrow stays outside it, so the line is not stepped */}
			<span className="underline-offset-4 group-hover:underline">{isExpanded ? "show less " : moreLabel}</span>
			<span className="text-lg leading-none">{isExpanded ? "▴" : "▾"}</span>
		</Button>
	)
}
