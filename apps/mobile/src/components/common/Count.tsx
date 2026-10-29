import { fontFamilies } from "@carlnotes/nightshift/typography"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"

/**
 * Shows a count after its label, as in "Viewers: 12", with the label in the display font and the number emphasized
 * in the body font. The pair reads as one accessible element.
 */
export function Count({ label, count }: { label: string; count: number }) {
	return (
		<View
			accessible
			accessibilityLabel={`${label}: ${count.toLocaleString()}`}
			className="flex-row items-center gap-1.5"
		>
			<Text style={{ fontFamily: fontFamilies.display.name }} className="text-sm text-muted-foreground">
				{label}:
			</Text>
			<Text className="px-1.5 text-sm font-semibold tabular-nums">{count.toLocaleString()}</Text>
		</View>
	)
}
