import type { Note } from "@carlnotes/contracts/notes"
import { type NotesTableElements, NotesTable as SharedNotesTable } from "@carlnotes/core/components/NotesTable"
import { Globe, Lock, Users } from "lucide-react-native"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { DataTable } from "@/components/table/DataTable"
import { NoteRowBadge } from "./NoteUnreadBadge"

// each visibility's icon beside its name
const VISIBILITY_ICONS = { private: Lock, team: Users, public: Globe }

/**
 * Draws the shared Tasting Notes table with native Topic and Team note routes.
 */
export function NotesTable({ notes, path }: { notes: Note[]; path: string }) {
	return (
		<SharedNotesTable
			notes={notes}
			elements={NOTES_TABLE_ELEMENTS}
			renderNoteName={(note) => (
				<View className="flex-row items-center gap-1.5">
					<AnchorLink
						href={`${path.split("?")[0]}/notes/${note.id}`}
						accessibilityLabel={`Open ${note.name}`}
						className="min-h-12 shrink justify-center"
					>
						<Text className="text-sm text-link">{note.name}</Text>
					</AnchorLink>
					<NoteRowBadge noteId={note.id} />
				</View>
			)}
		/>
	)
}

// the native standard table, with the visibility's icon beside its name
const NOTES_TABLE_ELEMENTS: NotesTableElements = {
	Table: DataTable,
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Visibility: ({ visibility, label }) => (
		<View className="flex-row flex-wrap items-center gap-1.5">
			<Icon as={VISIBILITY_ICONS[visibility]} className="size-4 text-muted-foreground" />
			<Text className="text-sm text-muted-foreground">{label}</Text>
		</View>
	),
}
