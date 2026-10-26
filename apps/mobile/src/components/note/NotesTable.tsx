import type { Note } from "@carlnotes/contracts/notes"
import {
	type NotesTableComponents,
	noteSortValues,
	NotesTable as SharedNotesTable,
} from "@carlnotes/core/components/NotesTable"
import { usePaginatedRowSort } from "@carlnotes/core/hooks/usePaginatedRowSort"
import { cn } from "@carlnotes/nightshift/classNames"
import { Globe, Lock, Users } from "lucide-react-native"
import { View } from "react-native"
import { WebFeatureButton } from "@/components/common/WebFeature"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard } from "@/components/table/TableCard"
import { TablePagination } from "@/components/table/TablePagination"

// native columns retain room for text scaling and wrap their labels at narrow widths
const COLUMN_CLASSES = { name: "flex-1", visibility: "w-24", updated: "w-20" }
const VISIBILITY_ICONS = { private: Lock, team: Users, public: Globe }

/**
 * Draws the shared Tasting Notes table with native cells and the existing web editor handoff.
 */
export function NotesTable({ notes, path }: { notes: Note[]; path: string }) {
	const { pageRows, sort, pagination } = usePaginatedRowSort({ rows: notes, valueByKey: noteSortValues })
	return (
		<TableCard>
			<SharedNotesTable
				notes={notes}
				renderedRows={pageRows.map((row) => ({ row }))}
				sort={sort}
				components={NOTES_TABLE_COMPONENTS}
				renderNoteName={(note) => (
					<WebFeatureButton
						title={note.name}
						description={
							note.canEdit
								? "Read and edit this Tasting Note on the topic’s web page."
								: "Read this Tasting Note on the topic’s web page."
						}
						path={path}
						variant="link"
						className="h-auto min-h-11 justify-start px-0"
					/>
				)}
			/>
			<View className="px-4">
				<TablePagination pagination={pagination} />
			</View>
		</TableCard>
	)
}

// map the shared table's structure to native layout and accessible controls
const NOTES_TABLE_COMPONENTS: NotesTableComponents = {
	Table: ({ children }) => <View>{children}</View>,
	Head: ({ children }) => <View className="border-b border-separator-strong">{children}</View>,
	Body: ({ children }) => <View>{children}</View>,
	Foot: ({ children }) => <View>{children}</View>,
	Row: ({ children, hasSeparator }) => (
		<View className={cn("min-h-12 flex-row items-center gap-2 px-4 py-2", hasSeparator && "border-b border-separator")}>
			{children}
		</View>
	),
	Cell: ({ children, column }) => <View className={COLUMN_CLASSES[column]}>{children}</View>,
	Header: ({ sort, sortKey, label }) => (
		<SortableHeader
			sort={sort}
			sortKey={sortKey}
			label={label}
			className={COLUMN_CLASSES[sortKey as keyof typeof COLUMN_CLASSES]}
		/>
	),
	Text: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Visibility: ({ visibility, label }) => (
		<View className="flex-row flex-wrap items-center gap-1.5">
			<Icon as={VISIBILITY_ICONS[visibility]} className="size-4 text-muted-foreground" />
			<Text className="text-sm text-muted-foreground">{label}</Text>
		</View>
	),
}
