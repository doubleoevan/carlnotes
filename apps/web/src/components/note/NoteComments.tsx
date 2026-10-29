import { authClient } from "@carlnotes/client/authClient"
import type { NoteComment } from "@carlnotes/contracts/notes"
import {
	type NoteCommentComposerProps,
	type NoteCommentsElements,
	type NoteCommentsProps,
	NoteComments as SharedNoteComments,
} from "@carlnotes/core/components/NoteComments"
import { NOTE_COMMENT_DELETE, REPORT_COMMENT_LABEL, toReportedCommentLabel } from "@carlnotes/core/lib/noteLabels"
import { Flag, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { IconButton } from "@/components/common/IconButton"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Textarea } from "@/components/primitives/textarea"

// retain the web thread's exact spacing and author controls around shared behavior
const ELEMENTS: NoteCommentsElements = {
	Container: ({ children }) => <div className="flex flex-col gap-3 text-sm">{children}</div>,
	Message: ({ children }) => <p className="text-muted-foreground">{children}</p>,
	Retry: ({ onPress }) => (
		<Button variant="link" size="sm" onClick={onPress}>
			Try again
		</Button>
	),
	List: ({ children }) => <ul className="flex flex-col gap-3">{children}</ul>,
	Row: ({ children }) => <li className="flex flex-col gap-1">{children}</li>,
	Header: ({ children }) => <div className="flex items-center gap-2">{children}</div>,
	Author: ({ author }) =>
		author ? (
			<UserProfileLink user={author} className="min-w-0 truncate font-semibold" />
		) : (
			<span className="text-muted-foreground truncate font-semibold">A closed account</span>
		),
	Age: ({ children }) => <span className="text-muted-foreground shrink-0 text-xs">{children}</span>,
	Body: ({ children }) => <p className="whitespace-pre-wrap break-words">{children}</p>,
	Delete: DeleteCommentButton,
	Report: ({ onPress }) => (
		<IconButton
			tooltip={REPORT_COMMENT_LABEL}
			className="text-muted-foreground hover:text-foreground ml-auto grid size-6 shrink-0 place-items-center"
			onClick={onPress}
		>
			<Flag className="size-3.5" />
		</IconButton>
	),
	Composer: CommentComposer,
}

/**
 * Adapts the shared thread to the existing desktop column and phone-browser sheet. A signed-in user can report
 * another person's comment, and block its author from the report.
 */
export function NoteComments(props: Omit<NoteCommentsProps, "onError" | "onReport">) {
	const { data: session } = authClient().useSession()
	const [reportedComment, setReportedComment] = useState<NoteComment | null>(null)
	return (
		<>
			<SharedNoteComments
				{...props}
				onError={toast.error}
				onReport={session ? setReportedComment : undefined}
				elements={ELEMENTS}
			/>
			{reportedComment?.author && (
				<ReportIssueDialog
					subjectKind="noteComment"
					subjectId={reportedComment.id}
					subjectLabel={toReportedCommentLabel(reportedComment.author.username)}
					author={{ id: reportedComment.author.userId, username: reportedComment.author.username }}
					onClose={() => setReportedComment(null)}
				/>
			)}
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
				className="text-muted-foreground hover:text-foreground ml-auto grid size-6 shrink-0 place-items-center"
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

// preserve form submission and the command-enter shortcut
function CommentComposer({ value, onChange, onSubmit, isPending, canSubmit, maxLength }: NoteCommentComposerProps) {
	return (
		<form
			className="flex flex-col gap-2"
			onSubmit={(event) => {
				// post the comment without navigating
				event.preventDefault()
				onSubmit()
			}}
		>
			<Textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
						// post the comment through the keyboard shortcut
						event.preventDefault()
						onSubmit()
					}
				}}
				placeholder="Add a comment"
				aria-label="Comment"
				rows={2}
				maxLength={maxLength}
				className="bg-card"
			/>
			<Button type="submit" size="sm" className="self-end" disabled={!canSubmit || isPending}>
				{isPending ? "Posting…" : "Comment"}
			</Button>
		</form>
	)
}
