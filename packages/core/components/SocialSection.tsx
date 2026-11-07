import type { CommentTarget, CommentThreadResponse } from "@carlnotes/contracts/social"
import { type ComponentType, type ReactNode, useState } from "react"
import type { CommentChapter } from "../lib/socialElements"
import { SOCIAL_SECTION_HEADING, toWeekCommentsLabel } from "../lib/socialLabels"

// what the thread needs from its page: the first page, the Topic and whether the user owns it, a Podcast Episode's
// chapters, and where the week's count goes
type SocialSectionThreadProps = {
	firstPage?: CommentThreadResponse
	topicId: string
	isTopicOwner: boolean
	chapters?: CommentChapter[]
	onChapterPress?: (chapterPosition: number) => void
	onWeekCommentCountChange?: (weekCommentCount: number) => void
}

// what each app's adapter of the comment thread takes: what the thread hangs on, whether the user is signed in, and
// what the thread needs from its page
export type CommentThreadAdapterProps = SocialSectionThreadProps & { target: CommentTarget; isSignedIn: boolean }

// the app's collapsible card, with the week's count beside its title, and its adapter of the comment thread
export type SocialSectionElements = {
	Section: ComponentType<{ title: string; titleAside: string | null; children: ReactNode }>
	CommentThread: ComponentType<CommentThreadAdapterProps>
}

export type SocialSectionProps = Omit<CommentThreadAdapterProps, "onWeekCommentCountChange"> & {
	elements: SocialSectionElements
}

/**
 * Shows a social target's comment thread in one collapsible card, with how many comments the last seven days added
 * beside the title.
 */
export function SocialSection({ elements, target, isSignedIn, ...threadProps }: SocialSectionProps) {
	const { Section, CommentThread } = elements
	const [weekCommentCount, setWeekCommentCount] = useState(threadProps.firstPage?.weekCommentCount ?? 0)
	return (
		<Section
			title={SOCIAL_SECTION_HEADING}
			titleAside={weekCommentCount > 0 ? toWeekCommentsLabel(weekCommentCount) : null}
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
