// the line a failed sign-in, sign-up, or close shows
import { Text } from "react-native"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * The line a failed sign-in, sign-up, or close shows, announced to the screen reader.
 */
export function SessionErrorText({ text }: { text: string | null }) {
	if (!text) {
		return null
	}
	return (
		<Text style={toTypeRoleStyle("body")} className="text-center text-destructive" accessibilityLiveRegion="polite">
			{text}
		</Text>
	)
}
