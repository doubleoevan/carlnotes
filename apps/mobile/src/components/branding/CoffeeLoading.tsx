import { cn } from "@carlnotes/nightshift/classNames"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { ActivityIndicator, Text, View } from "react-native"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Shows native loading progress with Nightshift's display font and trailing dots.
 */
export function CoffeeLoading({
	label = "Steeping",
	className,
	isSmall = false,
}: {
	label?: string
	className?: string
	isSmall?: boolean
}) {
	return (
		<View
			className={cn("flex-row items-center justify-center gap-2", className)}
			accessibilityLiveRegion="polite"
			accessibilityState={{ busy: true }}
		>
			<ActivityIndicator size="small" />
			<Text
				style={{ ...toTypeRoleStyle(isSmall ? "caption" : "body"), fontFamily: fontFamilies.display.name }}
				className="shrink text-muted-foreground"
			>
				{label}...
			</Text>
		</View>
	)
}
