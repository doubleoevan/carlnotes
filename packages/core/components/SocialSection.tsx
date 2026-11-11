import type { UnseenCommentMention } from "@carlnotes/contracts/commentMentions"
import type { CommentTarget, CommentThreadResponse } from "@carlnotes/contracts/social"
import { type ComponentType, type ReactNode, useState } from "react"
import type { CommentChapter } from "../lib/socialElements"
import { SOCIAL_SECTION_HEADING, toWeekCommentsLabel } from "../lib/socialLabels"
import { toThreadCommentMentions, useCommentMentions } from "../stores/commentMentionStore"

// what the thread needs from its page: the first page, the Topic and whether the user owns it, a Podcast Episode's
// chapters, and where the week's count and the thread's whole count go
type SocialSectionThreadProps = {
	firstPage?: CommentThreadResponse
	topicId: string
	isTopicOwner: boolean
	chapters?: CommentChapter[]
	onChapterPress?: (chapterPosition: number) => void
	onWeekCommentCountChange?: (weekCommentCount: number) => void
	onCommentCountChange?: (commentCount: number | null) => void
}

// what each app's adapter of the comment thread takes: what the thread hangs on, whether the user is signed in, and
// what the thread needs from its page
export type CommentThreadAdapterProps = SocialSectionThreadProps & { target: CommentTarget; isSignedIn: boolean }

// the app's collapsible card, with the week's count beside its title, and its adapter of the comment thread
export type SocialSectionElements = {
	Section: ComponentType<{
		title: string
		// the thread's mention badge, right after the title
		titleNote: ReactNode
		titleAside: string | null
		hasClosedDivider?: boolean
		children: ReactNode
	}>
	CommentThread: ComponentType<CommentThreadAdapterProps>
	// the badge that counts the thread's unseen Comment Mentions and opens the mentions list
	MentionBadge: ComponentType<{ commentMentions: UnseenCommentMention[] }>
}

export type SocialSectionProps = Omit<CommentThreadAdapterProps, "onWeekCommentCountChange"> & {
	// whether a divider shows under the section while it is closed, for a section of a page above another section
	hasClosedDivider?: boolean
	elements: SocialSectionElements
}

/**
 * Shows a social target's comment thread in one collapsible card, with how many comments the last seven days added
 * beside the title.
 */
export function SocialSection({ elements, target, isSignedIn, hasClosedDivider, ...threadProps }: SocialSectionProps) {
	const { Section, CommentThread, MentionBadge } = elements
	const [weekCommentCount, setWeekCommentCount] = useState(threadProps.firstPage?.weekCommentCount ?? 0)

	// the user's unseen mentions in this thread alone
	const commentMentions = toThreadCommentMentions(useCommentMentions(), target)
	return (
		<Section
			title={SOCIAL_SECTION_HEADING}
			titleNote={commentMentions.length > 0 && <MentionBadge commentMentions={commentMentions} />}
			titleAside={weekCommentCount > 0 ? toWeekCommentsLabel(weekCommentCount) : null}
			hasClosedDivider={hasClosedDivider}
		>
			<CommentThread
				target={target}
				isSignedIn={isSignedIn}
				onWeekCommentCountChange={setWeekCommentCount}
				{...threadProps}
			/>
		</Section>
	)
}
