import {
	SocialSection as SharedSocialSection,
	type SocialSectionElements,
	type SocialSectionProps,
} from "@carlnotes/core/components/SocialSection"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { CommentThread } from "./CommentThread"

// a full-width section that stays mounted while closed, so a posted comment and a draft survive a collapse. the week's
// count sits at the title's right
const ELEMENTS: SocialSectionElements = {
	Section: ({ title, titleAside, children }) => (
		<CollapsibleSection
			title={title}
			titleAside={titleAside && <Text className="shrink text-sm font-semibold text-badge">{titleAside}</Text>}
			isContentKept
		>
			{children}
		</CollapsibleSection>
	),
	CommentThread,
}

/**
 * The mobile app's collapsible card of a Topic's or a Podcast Episode's comment thread.
 */
export function SocialSection(props: Omit<SocialSectionProps, "elements">) {
	return <SharedSocialSection elements={ELEMENTS} {...props} />
}
