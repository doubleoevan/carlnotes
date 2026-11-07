import {
	type Comment,
	type CommentReply,
	hasFreeSharedCommentSlot,
	type ReactionSummary,
	type SharedCommentSlots,
} from "@carlnotes/contracts/social"
import { toCommentBodyParts } from "@carlnotes/contracts/socialText"
import { Fragment, memo } from "react"
import { toAgeLabel } from "../lib/labels"
import type { CommentChapter, SocialElements } from "../lib/socialElements"
import {
	COMMENT_THREAD_LABELS,
	SCROLLING_COMMENT_CHARS,
	SHARE_WITH_PODCAST_LABEL,
	SHARED_WITH_PODCAST_LABEL,
	toMoreRepliesLabel,
	toSharedCommentSlotsFullLabel,
	UNSHARE_WITH_PODCAST_LABEL,
} from "../lib/socialLabels"
import { ReactionRow } from "./ReactionRow"
import { SocialReportControl } from "./SocialReportControl"

// one comment with its replies, or one reply, the chapters it may name, who reads it, and what each control does. the
// handlers and elements stay the same across renders, so memo holds
type CommentRowProps = {
	comment: Comment | CommentReply
	chapterByPosition: ReadonlyMap<number, CommentChapter>
	onChapterPress?: (chapterPosition: number) => void
	isSignedIn: boolean
	// the Topic's shared comment slots for a user who may share. null for anyone else
	sharedCommentSlots: SharedCommentSlots | null
	// opens sign-up for a visitor who presses a reaction
	onSignIn: () => void
	onError: (message: string) => void
	onReactionsChange: (commentId: string, summary: ReactionSummary) => void
	onReply: (comment: CommentReply) => void
	onEdit: (comment: CommentReply) => void
	onDelete: (comment: CommentReply) => void
	onShare: (comment: CommentReply, isShared: boolean) => void
	// opens the report of another person's comment. absent where reporting is not offered
	onReport: (comment: CommentReply) => void
	onMoreReplies: (commentId: string) => void
	elements: SocialElements
}

// a user who may share presses the flame, which waits for a free shared comment slot and says so with none. anyone else
// sees it on a shared comment. a comment that a Podcast Episode read is done. a user may still unshare a waiting one
function toShareToggle(
	comment: CommentReply,
	sharedCommentSlots: SharedCommentSlots | null,
): { isShown: boolean; label: string; isDisabled: boolean } {
	const isShown = sharedCommentSlots !== null || comment.isSharedWithPodcast
	if (comment.isAired || !sharedCommentSlots) {
		return { isShown, label: SHARED_WITH_PODCAST_LABEL, isDisabled: false }
	}
	if (comment.isSharedWithPodcast) {
		return { isShown, label: UNSHARE_WITH_PODCAST_LABEL, isDisabled: false }
	}
	const isEverySlotUsed = !hasFreeSharedCommentSlot(sharedCommentSlots)
	return {
		isShown,
		label: isEverySlotUsed ? toSharedCommentSlotsFullLabel(sharedCommentSlots.slotCount) : SHARE_WITH_PODCAST_LABEL,
		isDisabled: isEverySlotUsed,
	}
}

/**
 * Renders one comment of a thread: its author, age, and reactions, its body with each stored mention
 * linked, its controls with the reply button, and its replies. A row renders again only if its own props changed.
 */
export const CommentRow = memo(function CommentRow(props: CommentRowProps) {
	const {
		comment,
		chapterByPosition,
		onChapterPress,
		isSignedIn,
		sharedCommentSlots,
		onSignIn,
		onError,
		onReactionsChange,
		onReply,
		onEdit,
		onDelete,
		onShare,
		onReport,
		onMoreReplies,
		elements,
	} = props
	const {
		Row,
		Header,
		Author,
		Age,
		Body,
		Controls,
		RowControl,
		ReplyButton,
		Report,
		ShareToggle,
		Mention,
		ChapterTag,
		Replies,
		More,
	} = elements

	// the chapter the comment names, and its share toggle
	const chapter = comment.chapterPosition === null ? undefined : chapterByPosition.get(comment.chapterPosition)
	const shareToggle = toShareToggle(comment, sharedCommentSlots)
	return (
		<Row>
			<Header>
				<Author author={comment.author} />
				<Age>{toAgeLabel(comment.createdAt)}</Age>
				{chapter && onChapterPress && <ChapterTag chapter={chapter} onPress={() => onChapterPress(chapter.position)} />}
				{/* the comment's reactions */}
				<ReactionRow
					target={{ kind: "comment", id: comment.id }}
					summary={comment.reactions}
					isSignedIn={isSignedIn}
					onSignIn={onSignIn}
					onError={onError}
					onSummaryChange={(summary) => onReactionsChange(comment.id, summary)}
					elements={elements}
				/>
			</Header>
			{/* the body as plain text, with a link on each stored mention alone */}
			<Body isScrolling={comment.body.length > SCROLLING_COMMENT_CHARS}>
				{toCommentBodyParts(comment.body, comment.mentions).map((bodyPart, index) =>
					bodyPart.mentionedUserId ? (
						// biome-ignore lint/suspicious/noArrayIndexKey: a body's parts never reorder
						<Mention key={index} userId={bodyPart.mentionedUserId}>
							{bodyPart.text}
						</Mention>
					) : (
						// biome-ignore lint/suspicious/noArrayIndexKey: a body's parts never reorder
						<Fragment key={index}>{bodyPart.text}</Fragment>
					),
				)}
			</Body>
			{/* the podcast share, the author's edit, disabled past the edit time, a delete, and a flag of someone else's */}
			<Controls>
				{shareToggle.isShown && (
					<ShareToggle
						label={shareToggle.label}
						isShared={comment.isSharedWithPodcast}
						isAired={comment.isAired}
						isDisabled={shareToggle.isDisabled}
						onPress={
							sharedCommentSlots && !comment.isAired ? () => onShare(comment, !comment.isSharedWithPodcast) : undefined
						}
					/>
				)}
				{comment.isAuthor && (
					<RowControl
						kind="edit"
						label={COMMENT_THREAD_LABELS.edit}
						disabledReason={comment.isEditable ? undefined : COMMENT_THREAD_LABELS.editLocked}
						onPress={() => onEdit(comment)}
					/>
				)}
				{comment.canDelete && (
					<RowControl kind="delete" label={COMMENT_THREAD_LABELS.delete} onPress={() => onDelete(comment)} />
				)}
				{isSignedIn && comment.author && !comment.isAuthor && (
					<SocialReportControl
						Report={Report}
						subject={{ subjectKind: "comment", subjectId: comment.id }}
						isReported={comment.isReported}
						onReport={() => onReport(comment)}
					/>
				)}
				<ReplyButton label={COMMENT_THREAD_LABELS.reply} onPress={() => onReply(comment)} />
			</Controls>
			{/* a top-level comment's replies oldest first, and the control that loads later ones */}
			{"replies" in comment && (comment.replies.length > 0 || comment.replyCount > 0) && (
				<Replies>
					{comment.replies.map((reply) => (
						<CommentRow key={reply.id} {...props} comment={reply} />
					))}
					{comment.replyCount > comment.replies.length && (
						<More
							label={toMoreRepliesLabel(comment.replyCount - comment.replies.length)}
							onPress={() => onMoreReplies(comment.id)}
						/>
					)}
				</Replies>
			)}
		</Row>
	)
})
