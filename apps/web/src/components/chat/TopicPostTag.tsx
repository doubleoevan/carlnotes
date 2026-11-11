import {
	TopicPostTag as SharedTopicPostTag,
	type TopicPostTagElements,
	type TopicPostTagProps,
} from "@carlnotes/core/components/TopicPostTag"
import { cn } from "@carlnotes/nightshift/classNames"
import { PenLine } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { QUESTION_BUBBLE_WIDTH_CLASS } from "@/lib/styleClasses"

/**
 * Adapts the shared chat post tag to a browser link.
 */
export function TopicPostTag(props: TopicPostTagProps) {
	return <SharedTopicPostTag {...props} elements={elements} />
}

// retain the browser's question width and truncation
const elements: TopicPostTagElements = {
	Link: ({ children, label, path, className }) => (
		<AnchorLink href={path} aria-label={label} title={label} className={cn(className, QUESTION_BUBBLE_WIDTH_CLASS)}>
			{children}
		</AnchorLink>
	),
	Tag: ({ children, className }) => <span className={cn(className, QUESTION_BUBBLE_WIDTH_CLASS)}>{children}</span>,
	Icon: () => <PenLine className="size-3.5 shrink-0" />,
	Label: ({ children }) => <span className="truncate">{children}</span>,
}
