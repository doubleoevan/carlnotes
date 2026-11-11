import {
	SocialSection as SharedSocialSection,
	type SocialSectionElements,
	type SocialSectionProps,
} from "@carlnotes/core/components/SocialSection"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { CommentMentionBadge } from "./CommentMentionBadge"
import { CommentThread } from "./CommentThread"

/**
 * The web's elements: a section that stays mounted while closed, so a posted comment and a draft survive a collapse.
 * The week's count sits at the title's right.
 */
export const SOCIAL_SECTION_ELEMENTS: SocialSectionElements = {
	Section: ({ title, titleNote, titleAside, hasClosedDivider, children }) => (
		<CollapsibleSection
			value="social"
			title={title}
			titleNote={titleNote}
			titleAside={titleAside && <span className="text-badge shrink-0 text-sm font-semibold">{titleAside}</span>}
			isContentKept
			hasClosedDivider={hasClosedDivider}
		>
			{children}
		</CollapsibleSection>
	),
	CommentThread,
	MentionBadge: ({ commentMentions }) => <CommentMentionBadge commentMentions={commentMentions} place="section" />,
}

/**
 * The web's collapsible card of a Topic's or a Podcast Episode's comment thread.
 */
export function SocialSection(props: Omit<SocialSectionProps, "elements">) {
	return <SharedSocialSection elements={SOCIAL_SECTION_ELEMENTS} {...props} />
}
