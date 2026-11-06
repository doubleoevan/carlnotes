import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/primitives/button"

/**
 * The button that returns to where the user came from, for a place with no browser back.
 */
export function BackButton({
	label = "Back",
	onClick,
	className,
}: {
	label?: string
	onClick: () => void
	className?: string
}) {
	return (
		<Button size="sm" variant="ghost" className={className} onClick={onClick}>
			<ArrowLeft aria-hidden className="size-4" />
			{label}
		</Button>
	)
}
