import { NOTE_COMMENT_MAX_CHARS, type NoteComment } from "@carlnotes/contracts/notes"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { type ComponentType, type PropsWithChildren, useRef, useState } from "react"
import type { NoteCommentThread } from "../hooks/useNoteComments"
import { toAgeLabel } from "../lib/labels"
import { NOTE_COMMENT_COMPOSER_LABELS } from "../lib/noteLabels"
import { TextComposer, type TextComposerElementProps } from "./TextComposer"

// the shared comment thread, composer state, and platform elements
export type NoteCommentsProps = NoteCommentThread & {
	canComment: boolean
	onError: (message: string) => void
	// opens the report of another person's comment, which can block its author. absent for a visitor
	onReport?: (comment: NoteComment) => void
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
	Composer: ComponentType<TextComposerElementProps>
}

/**
 * Shares comment ordering and pending deletes between the web and native layouts. The shared composer keeps a
 * failed post's draft.
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
	// block a second delete before a render
	const deletingRef = useRef(new Set<string>())
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

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
				<TextComposer
					{...NOTE_COMMENT_COMPOSER_LABELS}
					Composer={Composer}
					maxLength={NOTE_COMMENT_MAX_CHARS}
					isEnabled={!isLoading}
					onSubmit={async (body) =>
						(await postNoteComment(body).catch(() => false))
							? { isAccepted: true }
							: { isAccepted: false, message: null }
					}
					onFailure={() => onError("That comment didn't post. Carl suggests trying again.")}
				/>
			)}
		</Container>
	)
}
