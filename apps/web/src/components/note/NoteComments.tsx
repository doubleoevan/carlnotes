import { authClient } from "@carlnotes/client/authClient"
import type { NoteComment } from "@carlnotes/contracts/notes"
import {
	type NoteCommentsElements,
	type NoteCommentsProps,
	NoteComments as SharedNoteComments,
} from "@carlnotes/core/components/NoteComments"
import { NOTE_COMMENT_DELETE, REPORT_COMMENT_LABEL } from "@carlnotes/core/lib/noteLabels"
import { toCommentReportProps } from "@carlnotes/core/lib/reportCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { Flag, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { IconButton } from "@/components/common/IconButton"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { COMMENT_ELEMENTS } from "@/components/social/socialElements"
import { ROW_CONTROL_CLASS } from "@/lib/styleClasses"

// retain the web thread's exact spacing and author controls around shared behavior
const ELEMENTS: NoteCommentsElements = {
	...COMMENT_ELEMENTS,
	Container: ({ children }) => <div className="flex flex-col gap-3 text-sm">{children}</div>,
	Retry: ({ onPress }) => (
		<Button variant="link" size="sm" onClick={onPress}>
			Try again
		</Button>
	),
	Header: ({ children }) => <div className="flex items-center gap-2">{children}</div>,
	Author: ({ author }) =>
		author ? (
			<UserProfileLink user={author} className="min-w-0 truncate font-semibold" />
		) : (
			<span className="text-muted-foreground truncate font-semibold">A closed account</span>
		),
	Delete: DeleteCommentButton,
	Report: ({ onPress }) => (
		<IconButton tooltip={REPORT_COMMENT_LABEL} className={cn(ROW_CONTROL_CLASS, "ml-auto")} onClick={onPress}>
			<Flag className="size-3.5" />
		</IconButton>
	),
}

/**
 * Adapts the shared thread to the existing desktop column and phone-browser sheet. A signed-in user can report
 * another person's comment, and block its author from the report.
 */
export function NoteComments(props: Omit<NoteCommentsProps, "onError" | "onReport">) {
	const { data: session } = authClient().useSession()
	const [reportedComment, setReportedComment] = useState<NoteComment | null>(null)
	const commentReportProps = reportedComment && toCommentReportProps("noteComment", reportedComment)
	return (
		<>
			<SharedNoteComments
				{...props}
				onError={toast.error}
				onReport={session ? setReportedComment : undefined}
				elements={ELEMENTS}
			/>
			{commentReportProps && <ReportIssueDialog {...commentReportProps} onClose={() => setReportedComment(null)} />}
		</>
	)
}

// keep the comment in place until its author confirms deletion
function DeleteCommentButton({ onPress, isPending }: { onPress: () => void; isPending: boolean }) {
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
	return (
		<>
			<IconButton
				tooltip="Delete comment"
				isDisabled={isPending}
				className={cn(ROW_CONTROL_CLASS, "ml-auto")}
				onClick={() => setIsConfirmingDelete(true)}
			>
				<Trash2 className="size-3.5" />
			</IconButton>
			{isConfirmingDelete && (
				<ConfirmDialog
					title={NOTE_COMMENT_DELETE.title}
					confirmLabel={NOTE_COMMENT_DELETE.confirmLabel}
					cancelLabel={NOTE_COMMENT_DELETE.cancelLabel}
					onConfirm={() => {
						// close the prompt before the shared thread starts its guarded request
						setIsConfirmingDelete(false)
						onPress()
					}}
					onClose={() => setIsConfirmingDelete(false)}
				>
					{NOTE_COMMENT_DELETE.description}
				</ConfirmDialog>
			)}
		</>
	)
}
