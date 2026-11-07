import {
	SocialSection as SharedSocialSection,
	type SocialSectionElements,
	type SocialSectionProps,
} from "@carlnotes/core/components/SocialSection"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { CommentThread } from "./CommentThread"

// a full-width section that stays mounted while closed, so a posted comment and a draft survive a collapse. the week's
// count sits at the title's right
const ELEMENTS: SocialSectionElements = {
	Section: ({ title, titleAside, children }) => (
		<CollapsibleSection
			value="social"
			title={title}
			titleAside={titleAside && <span className="text-badge shrink-0 text-sm font-semibold">{titleAside}</span>}
			isContentKept
			className="mt-2"
		>
			{children}
		</CollapsibleSection>
	),
	CommentThread,
}

/**
 * The web's collapsible card of a Topic's or a Podcast Episode's comment thread.
 */
export function SocialSection(props: Omit<SocialSectionProps, "elements">) {
	return <SharedSocialSection elements={ELEMENTS} {...props} />
}
