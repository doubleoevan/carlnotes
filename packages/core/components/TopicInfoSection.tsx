import { cn } from "@carlnotes/nightshift/classNames"
import type { ComponentType, ReactNode } from "react"

export type TopicInfoSectionProps = {
	label: string
	children: ReactNode
	className?: string
	isFirst?: boolean
}
export type TopicInfoSectionElements = {
	Row: ComponentType<{ children: ReactNode; className: string }>
	Label: ComponentType<{ children: ReactNode }>
	Content: ComponentType<{ children: ReactNode }>
}

/**
 * Shares the label and content layout used by Topic and Finding information.
 */
export function TopicInfoSection({
	label,
	children,
	className,
	isFirst = false,
	elements,
}: TopicInfoSectionProps & { elements: TopicInfoSectionElements }) {
	return (
		<elements.Row className={cn("py-3 first:pt-0 last:pb-0", isFirst && "pt-0", className)}>
			{/* the section label stays separate from its body */}
			<elements.Label>{label}</elements.Label>
			<elements.Content>{children}</elements.Content>
		</elements.Row>
	)
}
