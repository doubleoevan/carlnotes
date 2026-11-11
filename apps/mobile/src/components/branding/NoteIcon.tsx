import { type LucideIcon, NotebookText } from "lucide-react-native"
import { View } from "react-native"
import { Icon } from "@/components/primitives/icon"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

/**
 * Draws the web's raised notebook tile for a note from Carl. A Topic Post's row draws the notebook and pen in the same
 * tile.
 */
export function NoteIcon({ icon = NotebookText }: { icon?: LucideIcon }) {
	const size = useFontScaledSize(24)
	return (
		<View
			style={{ width: size, height: size }}
			className="items-center justify-center rounded-md bg-card shadow-raised"
		>
			<Icon as={icon} className="size-3.75 text-primary" strokeWidth={2.5} />
		</View>
	)
}
