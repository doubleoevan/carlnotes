import type { Note } from "@carlnotes/contracts/notes"
import {
	type NotesTableElements,
	noteSortValues,
	NotesTable as SharedNotesTable,
} from "@carlnotes/core/components/NotesTable"
import { usePaginatedRowSort } from "@carlnotes/core/hooks/usePaginatedRowSort"
import { cn } from "@carlnotes/nightshift/classNames"
import { Globe, Lock, Users } from "lucide-react-native"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard } from "@/components/table/TableCard"
import { TablePagination } from "@/components/table/TablePagination"
import { TableCell, TableScroll } from "@/components/table/TableScroll"
import { NoteRowBadge } from "./NoteUnreadBadge"

// native columns retain room for text scaling and wrap their labels at narrow widths
const COLUMN_WIDTHS = { name: 192, visibility: 112, updated: 112 }
const VISIBILITY_ICONS = { private: Lock, team: Users, public: Globe }

/**
 * Draws the shared Tasting Notes table with native Topic and Team note routes.
 */
export function NotesTable({ notes, path }: { notes: Note[]; path: string }) {
	const { pageRows, sort, pagination } = usePaginatedRowSort({ rows: notes, valueByKey: noteSortValues })
	return (
		<TableCard>
			<SharedNotesTable
				notes={notes}
				renderedRows={pageRows.map((row) => ({ row }))}
				sort={sort}
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
			<View className="px-4">
				<TablePagination pagination={pagination} />
			</View>
		</TableCard>
	)
}

// map the shared table's structure to native layout and accessible controls
const NOTES_TABLE_ELEMENTS: NotesTableElements = {
	Table: ({ children }) => <TableScroll columns={COLUMN_WIDTHS}>{children}</TableScroll>,
	Head: ({ children }) => <View className="border-b border-separator-strong">{children}</View>,
	Body: ({ children }) => <View>{children}</View>,
	Foot: ({ children }) => <View>{children}</View>,
	Row: ({ children, hasSeparator }) => (
		<View className={cn("min-h-12 flex-row", hasSeparator && "border-b border-separator")}>{children}</View>
	),
	Cell: TableCell,
	Header: ({ sort, sortKey, label }) => (
		<TableCell column={sortKey}>
			<SortableHeader sort={sort} sortKey={sortKey} label={label} />
		</TableCell>
	),
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Visibility: ({ visibility, label }) => (
		<View className="flex-row flex-wrap items-center gap-1.5">
			<Icon as={VISIBILITY_ICONS[visibility]} className="size-4 text-muted-foreground" />
			<Text className="text-sm text-muted-foreground">{label}</Text>
		</View>
	),
}
