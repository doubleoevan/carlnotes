import {
	TopicInfoSection as SharedTopicInfoSection,
	type TopicInfoSectionElements,
	type TopicInfoSectionProps,
} from "@carlnotes/core/components/TopicInfoSection"
import { SECTION_LABEL_CLASS } from "@/lib/styleClasses"

// browser elements preserve the existing section typography and wrapping
const ELEMENTS: TopicInfoSectionElements = {
	Row: ({ children, className }) => <div className={className}>{children}</div>,
	Label: ({ children }) => <div className={SECTION_LABEL_CLASS}>{children}</div>,
	Content: ({ children }) => <div className="text-foreground mt-1 break-words">{children}</div>,
}

/**
 * Adapts the shared Topic information section to platform elements.
 */
export function TopicInfoSection(props: TopicInfoSectionProps) {
	return <SharedTopicInfoSection {...props} elements={ELEMENTS} />
}
