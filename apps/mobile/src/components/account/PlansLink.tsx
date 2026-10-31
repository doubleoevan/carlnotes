import { PLANS_PATH } from "@carlnotes/contracts/plans"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"

/**
 * Renders the web's sentence link to the plans page, which opens the Plans screen.
 */
export function PlansLink({ label, className }: { label: string; className?: string }) {
	return (
		<AnchorLink href={PLANS_PATH} accessibilityLabel={label} asChild>
			<Text className={cn("text-sm text-link underline", className)}>{label}</Text>
		</AnchorLink>
	)
}
