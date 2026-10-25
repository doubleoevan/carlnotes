// the note's comment thread: each comment with its author and time, the author's delete, and the composer for anyone
// who may write the note
import { NOTE_COMMENT_MAX_CHARS, type NoteComment } from "@carlnotes/contracts/notes"
import type { NoteCommentThread } from "@carlnotes/core/hooks/useNoteComments"
import { toAgeLabel } from "@carlnotes/core/lib/labels"
import { Trash2 } from "lucide-react"
import { type FormEvent, type KeyboardEvent, useState } from "react"
import { toast } from "sonner"
import { IconButton } from "@/components/common/IconButton"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Textarea } from "@/components/primitives/textarea"

/**
 * The thread beside a note, oldest first, with a composer for a user with edit access and nobody else.
 */
export function NoteComments({
	comments,
	isLoading,
	postNoteComment,
	deleteNoteComment,
	canComment,
}: NoteCommentThread & { canComment: boolean }) {
	// the comment being written
	const [noteCommentDraft, setNoteCommentDraft] = useState("")

	// post the trimmed draft. the box empties as the post leaves, and a post the api does not take goes back into the
	// box if nothing new is there
	async function handlePostNoteComment(): Promise<void> {
		const body = noteCommentDraft.trim()
		if (body.length === 0) {
			return
		}
		setNoteCommentDraft("")
		const isPosted = await postNoteComment(body)
		if (!isPosted) {
			toast.error("That comment didn't post. Carl suggests trying again.")
			setNoteCommentDraft((currentDraft) => (currentDraft.length === 0 ? body : currentDraft))
		}
	}

	// the command or control key with enter posts from the box
	function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault()
			void handlePostNoteComment()
		}
	}

	// the form's submit and the author's delete
	function handleSubmit(event: FormEvent): void {
		event.preventDefault()
		void handlePostNoteComment()
	}
	async function handleDeleteNoteComment(commentId: string): Promise<void> {
		if (!(await deleteNoteComment(commentId))) {
			toast.error("Carl couldn't remove that comment. Try again in a moment.")
		}
	}

	return (
		<div className="flex flex-col gap-3 text-sm">
			{/* the thread, oldest first */}
			{isLoading && <p className="text-muted-foreground">Unfolding the comments…</p>}
			{!isLoading && comments.length === 0 && <p className="text-muted-foreground">No comments yet.</p>}
			{comments.length > 0 && (
				<ul className="flex flex-col gap-3">
					{comments.map((comment) => (
						<li key={comment.id}>
							<NoteCommentRow comment={comment} onDelete={() => void handleDeleteNoteComment(comment.id)} />
						</li>
					))}
				</ul>
			)}

			{/* the composer, for anyone who may write the note */}
			{canComment && (
				<form className="flex flex-col gap-2" onSubmit={handleSubmit}>
					<Textarea
						value={noteCommentDraft}
						onChange={(event) => setNoteCommentDraft(event.target.value)}
						onKeyDown={handleDraftKeyDown}
						placeholder="Add a comment"
						aria-label="Comment"
						rows={2}
						maxLength={NOTE_COMMENT_MAX_CHARS}
						className="bg-card dark:bg-card"
					/>
					<Button type="submit" size="sm" className="self-end" disabled={noteCommentDraft.trim().length === 0}>
						Comment
					</Button>
				</form>
			)}
		</div>
	)
}

// one comment: the author's profile link, when it was written, the author's own delete, and the text
function NoteCommentRow({ comment, onDelete }: { comment: NoteComment; onDelete: () => void }) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				{/* the author, or the words for a closed account */}
				{comment.author ? (
					<UserProfileLink user={comment.author} className="min-w-0 truncate font-semibold" />
				) : (
					<span className="text-muted-foreground truncate font-semibold">A closed account</span>
				)}
				<span className="text-muted-foreground shrink-0 text-xs">{toAgeLabel(comment.createdAt)}</span>
				{comment.canDelete && (
					<IconButton
						tooltip="Delete comment"
						className="text-muted-foreground hover:text-foreground ml-auto grid size-6 shrink-0 place-items-center"
						onClick={onDelete}
					>
						<Trash2 className="size-3.5" />
					</IconButton>
				)}
			</div>
			<p className="whitespace-pre-wrap break-words">{comment.body}</p>
		</div>
	)
}
