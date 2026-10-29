import { NOTE_COMMENT_MAX_CHARS, type NoteComment } from "@carlnotes/contracts/notes"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { type ComponentType, type PropsWithChildren, useRef, useState } from "react"
import type { NoteCommentThread } from "../hooks/useNoteComments"
import { toAgeLabel } from "../lib/labels"

// the shared comment thread, composer state, and platform elements
export type NoteCommentsProps = NoteCommentThread & {
	canComment: boolean
	onError: (message: string) => void
	// opens the report of another person's comment, which can block its author. absent for a visitor
	onReport?: (comment: NoteComment) => void
}
export type NoteCommentComposerProps = {
	value: string
	onChange: (value: string) => void
	onSubmit: () => void
	isPending: boolean
	canSubmit: boolean
	maxLength: number
}
export type NoteCommentsElements = {
	Container: ComponentType<PropsWithChildren>
	Message: ComponentType<PropsWithChildren>
	Retry: ComponentType<{ onPress: () => void }>
	List: ComponentType<PropsWithChildren>
	Row: ComponentType<PropsWithChildren>
	Header: ComponentType<PropsWithChildren>
	Author: ComponentType<{ author: ProfileIdentity | null }>
	Age: ComponentType<PropsWithChildren>
	Body: ComponentType<PropsWithChildren>
	Delete: ComponentType<{ onPress: () => void; isPending: boolean }>
	Report: ComponentType<{ onPress: () => void }>
	Composer: ComponentType<NoteCommentComposerProps>
}

/**
 * Shares comment ordering, pending actions and retained drafts between the web and native layouts.
 */
export function NoteComments({
	comments,
	isLoading,
	hasError,
	retry,
	postNoteComment,
	deleteNoteComment,
	canComment,
	onError,
	onReport,
	elements: { Container, Message, Retry, List, Row, Header, Author, Age, Body, Delete, Report, Composer },
}: NoteCommentsProps & { elements: NoteCommentsElements }) {
	// retain a failed post verbatim and fence duplicate actions before a render
	const [draft, setDraft] = useState("")
	const [isPending, setIsPending] = useState(false)
	const isPendingRef = useRef(false)
	const deletingRef = useRef(new Set<string>())
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
	const canSubmit = canComment && !isLoading && draft.trim().length > 0 && draft.trim().length <= NOTE_COMMENT_MAX_CHARS

	// clear only the submitted draft after acknowledgement, preserving text typed during the request
	async function handlePost(): Promise<void> {
		if (!canSubmit || isPendingRef.current) {
			return
		}
		const submittedDraft = draft
		isPendingRef.current = true
		setIsPending(true)
		const isPosted = await postNoteComment(submittedDraft.trim()).catch(() => false)
		if (isPosted) {
			setDraft((current) => (current === submittedDraft ? "" : current))
		} else {
			onError("That comment didn't post. Carl suggests trying again.")
		}
		isPendingRef.current = false
		setIsPending(false)
	}

	// hide a comment only after the server accepts its author's delete
	async function handleDelete(comment: NoteComment): Promise<void> {
		if (!comment.canDelete || deletingRef.current.has(comment.id)) {
			return
		}
		deletingRef.current.add(comment.id)
		setDeletingIds(new Set(deletingRef.current))
		const isDeleted = await deleteNoteComment(comment.id).catch(() => false)
		if (!isDeleted) {
			onError("Carl couldn't remove that comment. Try again in a moment.")
		}
		deletingRef.current.delete(comment.id)
		setDeletingIds(new Set(deletingRef.current))
	}

	// preserve server order for equal timestamps and keep failure distinct from an empty thread
	const orderedComments = [...comments].sort((first, second) => first.createdAt.localeCompare(second.createdAt))
	return (
		<Container>
			{isLoading && <Message>Unfolding the comments…</Message>}
			{hasError && (
				<>
					<Message>{"Carl couldn't load the comments."}</Message>
					<Retry onPress={retry} />
				</>
			)}
			{!isLoading && !hasError && comments.length === 0 && <Message>No comments yet.</Message>}
			{orderedComments.length > 0 && (
				<List>
					{orderedComments.map((comment) => (
						<Row key={comment.id}>
							<Header>
								<Author author={comment.author} />
								<Age>{toAgeLabel(comment.createdAt)}</Age>
								{comment.canDelete && (
									<Delete onPress={() => void handleDelete(comment)} isPending={deletingIds.has(comment.id)} />
								)}
								{/* the report action */}
								{onReport && comment.author && !comment.canDelete && <Report onPress={() => onReport(comment)} />}
							</Header>
							<Body>{comment.body}</Body>
						</Row>
					))}
				</List>
			)}
			{canComment && (
				<Composer
					value={draft}
					onChange={setDraft}
					onSubmit={() => void handlePost()}
					isPending={isPending}
					canSubmit={canSubmit}
					maxLength={NOTE_COMMENT_MAX_CHARS}
				/>
			)}
		</Container>
	)
}
