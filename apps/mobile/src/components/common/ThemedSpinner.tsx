import { colors } from "@carlnotes/nightshift/colors"
import { ActivityIndicator } from "react-native"
import { useUniwind } from "uniwind"

/**
 * Shows a small spinner in a Nightshift color for the current theme, which an icon button shows while loading.
 */
export function ThemedSpinner({ color }: { color: keyof typeof colors }) {
	const { theme } = useUniwind()
	return <ActivityIndicator size="small" color={colors[color][theme === "dark" ? "dark" : "light"]} />
}
