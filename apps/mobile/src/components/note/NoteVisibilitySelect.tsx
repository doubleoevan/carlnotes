import type { NoteVisibilitySelectProps } from "@carlnotes/core/components/CreateNote"
import { NOTE_VISIBILITY_LABELS } from "@carlnotes/core/components/NotesTable"
import { NOTE_VISIBILITY_DESCRIPTIONS } from "@carlnotes/core/lib/noteLabels"
import { Globe, Lock, Users } from "lucide-react-native"
import { View } from "react-native"
import { Icon } from "@/components/primitives/icon"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Text } from "@/components/primitives/text"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

// bind the web's visibility icons to their native equivalents
const ICONS = { private: Lock, team: Users, public: Globe }

/**
 * Offers only server-granted visibility choices using the shared labels and native dropdown.
 */
export function NoteVisibilitySelect({ visibilities, visibility, onNoteVisibilityChange }: NoteVisibilitySelectProps) {
	// reserve room for the label, icon and checkmark as the system text grows
	const menuWidth = useFontScaledSize(160)
	if (visibilities.length <= 1) {
		return (
			<View className="flex-row items-center gap-1.5" accessibilityLabel={NOTE_VISIBILITY_DESCRIPTIONS[visibility]}>
				<Icon as={ICONS[visibility]} className="size-4 text-muted-foreground" />
				<Text className="text-sm text-muted-foreground">{NOTE_VISIBILITY_LABELS[visibility]}</Text>
			</View>
		)
	}
	return (
		<Select
			value={{ value: visibility, label: NOTE_VISIBILITY_LABELS[visibility] }}
			onValueChange={(option) => {
				const selectedVisibility = visibilities.find((entry) => entry === option?.value)
				if (selectedVisibility) {
					onNoteVisibilityChange(selectedVisibility)
				}
			}}
		>
			<SelectTrigger accessibilityLabel="Note visibility" className="min-w-28">
				<View className="flex-row items-center gap-2">
					<Icon as={ICONS[visibility]} className="size-4 text-foreground" />
					<SelectValue placeholder="Visibility" />
				</View>
			</SelectTrigger>
			<SelectContent style={{ minWidth: menuWidth }}>
				{visibilities.map((entry) => (
					<SelectItem key={entry} value={entry} label={NOTE_VISIBILITY_LABELS[entry]}>
						<Icon as={ICONS[entry]} className="size-4 text-foreground" />
						<Text className="flex-1 text-sm text-foreground">{NOTE_VISIBILITY_LABELS[entry]}</Text>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
