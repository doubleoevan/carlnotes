import type { NoteSaveStatus } from "@carlnotes/core/hooks/useNoteBodySave"
import { NOTE_SAVE_STATUS_LABELS, REPORT_NOTE_LABEL } from "@carlnotes/core/lib/noteLabels"
import { Flag } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { ReportIssueDialog, type ReportSubject } from "@/components/common/ReportIssueDialog"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Renders the foot of an open note in the web dialog's order: where the note stands, then the report or the delete.
 */
export function NoteFooter({
	canEdit,
	canDelete,
	reportSubject,
	isDisabled,
	noteSaveStatus,
	canRetrySave,
	onRetrySave,
	onDelete,
}: {
	canEdit: boolean
	canDelete: boolean
	// another person's note as a report names it, or null for the owner, an admin, a visitor, and an offline draft
	reportSubject: ReportSubject | null
	// true offline or while a rename or visibility change is pending
	isDisabled: boolean
	noteSaveStatus: NoteSaveStatus
	// an unsaved body with no conflict can try the save again
	canRetrySave: boolean
	onRetrySave: () => void
	onDelete: () => void
}) {
	const [isReporting, setIsReporting] = useState(false)
	if (!canEdit && !canDelete && !reportSubject) {
		return null
	}
	return (
		<View className="flex-row flex-wrap items-center justify-end gap-3 py-2">
			{/* the save status, with its retry while the body is unsaved */}
			{canEdit && (
				<Text accessibilityLiveRegion="polite" className="text-sm font-medium">
					{NOTE_SAVE_STATUS_LABELS[noteSaveStatus]}
				</Text>
			)}
			{canEdit && canRetrySave && (
				<Button accessibilityLabel="Retry saving note" variant="link" size="sm" onPress={onRetrySave}>
					<Text>Try again</Text>
				</Button>
			)}
			{/* the report action */}
			{reportSubject && (
				<Button accessibilityLabel={REPORT_NOTE_LABEL} variant="outline" size="sm" onPress={() => setIsReporting(true)}>
					<Icon as={Flag} className="size-3.5 text-muted-foreground" />
					<Text>{REPORT_NOTE_LABEL}</Text>
				</Button>
			)}
			{canDelete && (
				<Button
					accessibilityLabel="Delete note"
					variant="destructive"
					size="sm"
					disabled={isDisabled}
					onPress={onDelete}
				>
					<Text>Delete</Text>
				</Button>
			)}
			{/* the report dialog */}
			{isReporting && reportSubject && <ReportIssueDialog {...reportSubject} onClose={() => setIsReporting(false)} />}
		</View>
	)
}
