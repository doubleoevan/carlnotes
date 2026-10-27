import {
	deleteNoteComment as deleteNoteCommentRequest,
	fetchNoteComments,
	postNoteComment as postNoteCommentRequest,
} from "@carlnotes/client/noteClient"
import type { NoteComment } from "@carlnotes/contracts/notes"
import { useEffect, useRef, useState } from "react"

// the open note's thread and the two writes that change it
export type NoteCommentThread = {
	comments: NoteComment[]
	isLoading: boolean
	hasError: boolean
	retry: () => void
	postNoteComment: (body: string) => Promise<boolean>
	deleteNoteComment: (commentId: string) => Promise<boolean>
}

/**
 * Loads a note's comments and retains only acknowledged posts and deletions.
 */
export function useNoteComments(noteId: string): NoteCommentThread {
	// keep the last confirmed thread while a retry loads
	const [comments, setComments] = useState<NoteComment[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [hasError, setHasError] = useState(false)
	const retryRef = useRef<() => void>(() => {})
	const lifetimeRef = useRef({ noteId, isActive: true, changes: 0, isPosting: false, isLoading: true })

	// one load per note. a slow response for a note no longer open is dropped
	useEffect(() => {
		const lifetime = { noteId, isActive: true, changes: 0, isPosting: false, isLoading: true }
		lifetimeRef.current = lifetime
		setComments([])
		// retire each previous request when a retry starts
		let isCurrent = true
		let requestVersion = 0

		// keep the loaded thread only while this note is still the one open
		function loadComments(): void {
			const currentRequestVersion = ++requestVersion
			const mutationVersion = lifetime.changes
			setIsLoading(true)
			lifetime.isLoading = true
			setHasError(false)
			void fetchNoteComments(noteId)
				.then((loadedComments) => {
					if (isCurrent && currentRequestVersion === requestVersion && mutationVersion === lifetime.changes) {
						setComments(loadedComments)
					}
				})
				.catch(() => {
					if (isCurrent && currentRequestVersion === requestVersion) {
						setHasError(true)
					}
				})
				.finally(() => {
					if (isCurrent && currentRequestVersion === requestVersion) {
						setIsLoading(false)
						lifetime.isLoading = false
					}
				})
		}

		// start the first read and retain its retry for the current note
		retryRef.current = loadComments
		loadComments()

		// the cleanup marks the load stale
		return () => {
			isCurrent = false
			lifetime.isActive = false
		}
	}, [noteId])

	// append the posted comment to the thread's end
	async function postNoteComment(body: string): Promise<boolean> {
		const lifetime = lifetimeRef.current
		if (!lifetime.isActive || lifetime.noteId !== noteId || lifetime.isPosting || lifetime.isLoading) {
			return false
		}
		lifetime.isPosting = true
		const postedComment = await postNoteCommentRequest(noteId, body).catch(() => null)
		lifetime.isPosting = false
		if (!postedComment || !lifetime.isActive) {
			return false
		}
		lifetime.changes += 1
		setComments((currentComments) => [
			...currentComments.filter((comment) => comment.id !== postedComment.id),
			postedComment,
		])
		return true
	}

	// take the deleted comment out of the thread
	async function deleteNoteComment(commentId: string): Promise<boolean> {
		const lifetime = lifetimeRef.current
		if (!lifetime.isActive || lifetime.noteId !== noteId || lifetime.isLoading) {
			return false
		}
		const isDeleted = await deleteNoteCommentRequest(noteId, commentId).catch(() => false)
		if (isDeleted && lifetime.isActive) {
			lifetime.changes += 1
			setComments((currentComments) => currentComments.filter((comment) => comment.id !== commentId))
		}
		return isDeleted
	}

	// the thread and its two writes
	return {
		comments,
		isLoading,
		hasError,
		retry: () => retryRef.current(),
		postNoteComment,
		deleteNoteComment,
	}
}
