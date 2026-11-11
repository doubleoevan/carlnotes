import { type CommentWriteResult, fetchMentionSuggestions } from "@carlnotes/client/socialClient"
import {
	type CommentReply,
	type CommentTarget,
	type CommentThreadResponse,
	hasFreeSharedCommentSlot,
	type SharedCommentSlots,
} from "@carlnotes/contracts/social"
import { COMMENT_MAX_CHARS } from "@carlnotes/contracts/socialText"
import { useEffect, useMemo, useState } from "react"
import { useCommentThread } from "../hooks/useCommentThread"
import { useStableCallback } from "../hooks/useStableCallback"
import { COMMENT_DELETE_CONFIRMATION } from "../lib/confirmationCopy"
import type { CommentChapter, SocialElements } from "../lib/socialElements"
import {
	COMMENT_THREAD_LABELS,
	SHARE_WITH_PODCAST_LABEL,
	SHARED_COMMENT_SLOTS_TOOLTIP,
	SHARED_WITH_PODCAST_LABEL,
	toMoreCommentsLabel,
	toSharedCommentSlotsFullLabel,
	toSharedCommentSlotsLabel,
} from "../lib/socialLabels"
import { CommentRow } from "./CommentRow"
import { TextComposer, type TextComposerResult } from "./TextComposer"

// what the thread hangs on, the first page its page came with, and how each platform signs in, shows an error, and
// reports
export type CommentThreadProps = {
	target: CommentTarget
	// the first page from the page's own read. absent for a thread that loads as it opens
	firstPage?: CommentThreadResponse
	// the Comment a link named, which leads the thread and is highlighted
	linkedCommentId?: string
	isSignedIn: boolean
	// opens sign-up for a visitor who presses a type, the composer's button, or Reply
	onSignIn: () => void
	onError: (message: string) => void
	// opens the report of another person's comment, which can block its author. absent where reporting is not offered
	onReport: (comment: CommentReply) => void
	// the week's comment count as it stands, for the card's heading
	onWeekCommentCountChange?: (weekCommentCount: number) => void
	// the thread's whole comment count as it stands, for the page's details line. null if the api does not count it
	onCommentCountChange?: (commentCount: number | null) => void
	// a Podcast Episode's chapters, which a comment may name, and what a press on a chapter's tag does
	chapters?: CommentChapter[]
	onChapterPress?: (chapterPosition: number) => void
	elements: SocialElements
}

// the chapters of a thread with none, one array so the rows' chapter map stays the same across renders
const NO_CHAPTERS: CommentChapter[] = []

// the composer: open for a new comment, for a reply to a comment, or on the comment being edited
type ComposerState = { editedComment: CommentReply | null; repliedComment: CommentReply | null }

// the composer's title: a reply, an edit, or a new comment
function toComposerTitle({ editedComment, repliedComment }: ComposerState): string {
	if (repliedComment) {
		return COMMENT_THREAD_LABELS.reply
	}
	return editedComment ? COMMENT_THREAD_LABELS.editOwn : COMMENT_THREAD_LABELS.compose
}

// a user who may share has the switch on every composer. with no free shared comment slot it is off and says why, an
// edit keeps the shared comment slot its comment holds, and an aired comment stays shared. isShared is left out for
// anyone else, which takes the api's default
function toComposerShare({
	composerState,
	sharedCommentSlots,
	isShareChosen,
}: {
	composerState: ComposerState | null
	sharedCommentSlots: SharedCommentSlots | null
	isShareChosen: boolean
}): { isOffered: boolean; disabledReason?: string; isShared?: boolean } {
	if (!composerState || !sharedCommentSlots) {
		return { isOffered: false }
	}
	const { editedComment } = composerState
	if (editedComment?.isAired) {
		return { isOffered: true, disabledReason: SHARED_WITH_PODCAST_LABEL, isShared: true }
	}
	if (editedComment?.isSharedWithPodcast || hasFreeSharedCommentSlot(sharedCommentSlots)) {
		return { isOffered: true, isShared: isShareChosen }
	}
	return {
		isOffered: true,
		disabledReason: toSharedCommentSlotsFullLabel(sharedCommentSlots.slotCount),
		isShared: false,
	}
}

/**
 * Shares the comment thread between the web and the mobile app: the button that opens the composer, and the
 * comments newest first, each with its reactions, its author's controls, and its replies oldest first.
 */
export function CommentThread({
	target,
	firstPage,
	linkedCommentId,
	isSignedIn,
	onSignIn,
	onError,
	onReport,
	onWeekCommentCountChange,
	onCommentCountChange,
	chapters = NO_CHAPTERS,
	onChapterPress,
	elements,
}: CommentThreadProps) {
	const { Container, Message, Loading, More, List, MoreToggle, Confirm } = elements
	const { ComposerButton, ComposerFrame, Composer } = elements
	const { ChapterSelect, ComposerRow, ComposerShareSwitch, SharedCommentSlotsLabel } = elements
	const thread = useCommentThread(target, firstPage, linkedCommentId)

	// the composer, the chapter a new comment names, whether it is shared, and the comment whose delete awaits
	// confirmation
	const [composerState, setComposerState] = useState<ComposerState | null>(null)
	const [chapterPosition, setChapterPosition] = useState<number | null>(null)
	// the share switch starts on, and off on a Topic Post's thread
	const isShareOnAtStart = target.kind !== "post"
	const [isShareChosen, setIsShareChosen] = useState(isShareOnAtStart)
	const [commentToDelete, setCommentToDelete] = useState<CommentReply | null>(null)
	const chapterByPosition = useMemo(() => new Map(chapters.map((chapter) => [chapter.position, chapter])), [chapters])

	// report the week's count and the thread's whole count
	const { sharedCommentSlots, weekCommentCount, commentCount } = thread
	useEffect(() => {
		onWeekCommentCountChange?.(weekCommentCount)
	}, [weekCommentCount, onWeekCommentCountChange])
	useEffect(() => {
		onCommentCountChange?.(commentCount)
	}, [commentCount, onCommentCountChange])

	const composerShare = toComposerShare({ composerState, sharedCommentSlots, isShareChosen })

	// post a new comment or a reply, or save an edit, and close the composer once it is stored
	async function handleSubmit(body: string): Promise<TextComposerResult> {
		const { editedComment, repliedComment } = composerState ?? { editedComment: null, repliedComment: null }
		const commentWriteResult = editedComment
			? await saveEdit(editedComment, body)
			: await thread.post(body, {
					chapterPosition: repliedComment ? null : chapterPosition,
					parentCommentId: repliedComment ? (repliedComment.parentCommentId ?? repliedComment.id) : null,
					isSharedWithPodcast: composerShare.isShared,
				})
		if (commentWriteResult.status === "saved") {
			setComposerState(null)
			setChapterPosition(null)
			return { isAccepted: true }
		}

		// a comment past its edit time, or a write that failed, with Carl's words if the text was rejected
		const message =
			commentWriteResult.status === "locked"
				? COMMENT_THREAD_LABELS.lockedError
				: (commentWriteResult.message ?? COMMENT_THREAD_LABELS.postError)
		return { isAccepted: false, message }
	}

	// save an edit's words, then its share if the switch changed it
	async function saveEdit(editedComment: CommentReply, body: string): Promise<CommentWriteResult> {
		const commentWriteResult = await thread.edit(editedComment.id, body)
		const { isShared } = composerShare
		if (
			commentWriteResult.status === "saved" &&
			isShared !== undefined &&
			isShared !== editedComment.isSharedWithPodcast
		) {
			await handleShare(editedComment, isShared)
		}
		return commentWriteResult
	}

	// delete the confirmed comment, the user's own or one the user may moderate
	async function handleConfirmDelete(): Promise<void> {
		if (!commentToDelete) {
			return
		}
		if (!(await thread.remove(commentToDelete.id))) {
			onError(COMMENT_THREAD_LABELS.deleteError)
		}
		setCommentToDelete(null)
	}

	// open the composer for a user, or sign-up for a visitor
	function openComposer(nextComposerState: ComposerState): void {
		if (isSignedIn) {
			setComposerState(nextComposerState)
			setIsShareChosen(isShareOnAtStart)
		} else {
			onSignIn()
		}
	}

	// share a comment with the podcast or take it back. a Topic with no free shared comment slot shows its toggles
	// disabled, so a share that finds none is a race with another editor and reads as a failed save
	async function handleShare(comment: CommentReply, isShared: boolean): Promise<void> {
		if (!(await thread.share(comment.id, isShared))) {
			onError(COMMENT_THREAD_LABELS.shareError)
		}
	}

	// the rows' handlers stay the same across renders, so a change to one comment renders that row alone
	const handleSignIn = useStableCallback(onSignIn)
	const handleError = useStableCallback(onError)
	const handleChapterPress = useStableCallback((position: number) => onChapterPress?.(position))
	const handleReactionsChange = useStableCallback(thread.keepReactions)
	const handleReply = useStableCallback((comment: CommentReply) =>
		openComposer({ editedComment: null, repliedComment: comment }),
	)
	const handleEdit = useStableCallback((comment: CommentReply) => {
		setComposerState({ editedComment: comment, repliedComment: null })
		setIsShareChosen(comment.isSharedWithPodcast)
	})
	const handleShareToggle = useStableCallback(
		(comment: CommentReply, isShared: boolean) => void handleShare(comment, isShared),
	)
	const handleReport = useStableCallback(onReport)
	const handleMoreReplies = useStableCallback(
		(commentId: string) =>
			void thread.loadMoreReplies(commentId).then((isLoaded) => isLoaded || onError(COMMENT_THREAD_LABELS.loadError)),
	)
	return (
		<>
			<Container>
				{/* the button, and how many comments are shared with the podcast for a user who may share */}
				<ComposerRow>
					<ComposerButton
						label={COMMENT_THREAD_LABELS.composeButton}
						onPress={() => openComposer({ editedComment: null, repliedComment: null })}
					/>
					{sharedCommentSlots && (
						<SharedCommentSlotsLabel tooltip={SHARED_COMMENT_SLOTS_TOOLTIP}>
							{toSharedCommentSlotsLabel(sharedCommentSlots)}
						</SharedCommentSlotsLabel>
					)}
				</ComposerRow>
				{composerState && (
					<ComposerFrame title={toComposerTitle(composerState)} onClose={() => setComposerState(null)}>
						{/* a new comment on a Podcast Episode may name a chapter */}
						{!composerState.editedComment && !composerState.repliedComment && chapters.length > 0 && (
							<ChapterSelect chapters={chapters} chapterPosition={chapterPosition} onChange={setChapterPosition} />
						)}
						<TextComposer
							key={composerState.editedComment?.id ?? composerState.repliedComment?.id ?? "new"}
							Composer={Composer}
							maxLength={COMMENT_MAX_CHARS}
							initialText={composerState.editedComment?.body ?? ""}
							placeholder={
								composerState.repliedComment
									? COMMENT_THREAD_LABELS.replyPlaceholder
									: COMMENT_THREAD_LABELS.placeholder
							}
							submitLabel={COMMENT_THREAD_LABELS.post}
							isAutoFocused
							onSubmit={handleSubmit}
							loadSuggestions={fetchMentionSuggestions}
							footerStart={
								composerShare.isOffered && (
									<ComposerShareSwitch
										label={SHARE_WITH_PODCAST_LABEL}
										isChecked={composerShare.isShared === true}
										disabledReason={composerShare.disabledReason}
										onChange={setIsShareChosen}
									/>
								)
							}
						/>
					</ComposerFrame>
				)}

				{/* the first read's state */}
				{thread.isLoading && <Loading />}
				{thread.hasError && (
					<>
						<Message>{COMMENT_THREAD_LABELS.loadError}</Message>
						<More label={COMMENT_THREAD_LABELS.retry} onPress={thread.retry} />
					</>
				)}

				{/* the comments newest first, each with its replies */}
				{thread.comments.length > 0 && (
					<List>
						{thread.comments.map((comment) => (
							<CommentRow
								key={comment.id}
								comment={comment}
								linkedCommentId={linkedCommentId}
								chapterByPosition={chapterByPosition}
								onChapterPress={onChapterPress ? handleChapterPress : undefined}
								isSignedIn={isSignedIn}
								sharedCommentSlots={sharedCommentSlots}
								onSignIn={handleSignIn}
								onError={handleError}
								onReactionsChange={handleReactionsChange}
								onReply={handleReply}
								onEdit={handleEdit}
								onDelete={setCommentToDelete}
								onShare={handleShareToggle}
								onReport={handleReport}
								onMoreReplies={handleMoreReplies}
								elements={elements}
							/>
						))}
					</List>
				)}
			</Container>
			{/* the toggle under the card, which shows what is loaded and reads ahead */}
			{(thread.hasMore || thread.hasLess) && (
				<MoreToggle
					isExpanded={!thread.hasMore}
					moreLabel={toMoreCommentsLabel(thread.hiddenCommentCount)}
					onToggle={() =>
						thread.hasMore
							? void thread.showMore().then((isLoaded) => isLoaded || onError(COMMENT_THREAD_LABELS.loadError))
							: thread.showLess()
					}
				/>
			)}
			{commentToDelete && (
				<Confirm
					{...COMMENT_DELETE_CONFIRMATION}
					onConfirm={handleConfirmDelete}
					onClose={() => setCommentToDelete(null)}
				/>
			)}
		</>
	)
}
