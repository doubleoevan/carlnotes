import type { UnseenCommentMention } from "@carlnotes/contracts/commentMentions"
import type { ComponentType, ReactNode } from "react"
import { CARL_NAME, COMMENT_MENTIONS_EMPTY_TEXT, MARK_ALL_SEEN_LABEL } from "../lib/socialLabels"
import { markEveryCommentMentionSeen, useCommentMentions } from "../stores/commentMentionStore"

// one row as a platform draws it: the mention, its author's name, and what choosing it does
type CommentMentionRowProps = {
	commentMention: UnseenCommentMention
	authorName: string
	onChoose: () => void
}

// the platform elements of the mentions list: the rows' list, one row, the line an empty list shows, and the action
// that marks every mention seen
export type CommentMentionListElements = {
	List: ComponentType<{ children: ReactNode }>
	Row: ComponentType<CommentMentionRowProps>
	Empty: ComponentType<{ children: string }>
	MarkAllSeen: ComponentType<{ label: string; onPress: () => void }>
}

/**
 * Lists the user's unseen Comment Mentions, newest first: who mentioned them, the Comment's first line, and the page
 * it sits on. Choosing a row opens the Comment on its page, and Mark all seen empties the list. Showing the list
 * marks nothing seen.
 */
export function CommentMentionList({
	onChoose,
	elements: { List, Row, Empty, MarkAllSeen },
}: {
	onChoose: (commentMention: UnseenCommentMention) => void
	elements: CommentMentionListElements
}) {
	const commentMentions = useCommentMentions()
	if (commentMentions.length === 0) {
		return <Empty>{COMMENT_MENTIONS_EMPTY_TEXT}</Empty>
	}
	return (
		<>
			<List>
				{commentMentions.map((commentMention) => (
					<Row
						key={commentMention.commentId}
						commentMention={commentMention}
						authorName={commentMention.author?.username ?? CARL_NAME}
						onChoose={() => onChoose(commentMention)}
					/>
				))}
			</List>
			<MarkAllSeen label={MARK_ALL_SEEN_LABEL} onPress={() => void markEveryCommentMentionSeen()} />
		</>
	)
}
