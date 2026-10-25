import {
	deleteNoteComment as deleteNoteCommentRequest,
	fetchNoteComments,
	postNoteComment as postNoteCommentRequest,
} from "@carlnotes/client/noteClient"
import type { NoteComment } from "@carlnotes/contracts/notes"
import { useEffect, useState } from "react"

// the thread as the dialog shows it, and the two writes that change it
export type NoteCommentThread = {
	comments: NoteComment[]
	isLoading: boolean
	postNoteComment: (body: string) => Promise<boolean>
	deleteNoteComment: (commentId: string) => Promise<boolean>
}

/**
 * A note's comment thread, loaded when the note opens. A post appends the comment the api returns, and a delete
 * removes the row. Either returns whether the api took it.
 */
export function useNoteComments(noteId: string): NoteCommentThread {
	const [comments, setComments] = useState<NoteComment[]>([])
	const [isLoading, setIsLoading] = useState(true)

	// one load per note. a slow response for a note no longer open is dropped
	useEffect(() => {
		let isCurrent = true
		setIsLoading(true)

		// keep the loaded thread only while this note is still the one open
		void fetchNoteComments(noteId).then((loadedComments) => {
			if (isCurrent) {
				setComments(loadedComments)
				setIsLoading(false)
			}
		})

		// the cleanup marks the load stale
		return () => {
			isCurrent = false
		}
	}, [noteId])

	// append the posted comment to the thread's end
	async function postNoteComment(body: string): Promise<boolean> {
		const postedComment = await postNoteCommentRequest(noteId, body)
		if (!postedComment) {
			return false
		}
		setComments((currentComments) => [...currentComments, postedComment])
		return true
	}

	// take the deleted comment out of the thread
	async function deleteNoteComment(commentId: string): Promise<boolean> {
		const isDeleted = await deleteNoteCommentRequest(noteId, commentId)
		if (isDeleted) {
			setComments((currentComments) => currentComments.filter((comment) => comment.id !== commentId))
		}
		return isDeleted
	}

	// the thread and its two writes
	return { comments, isLoading, postNoteComment, deleteNoteComment }
}
