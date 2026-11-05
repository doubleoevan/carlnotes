import {
	type PersonalSourceLinkElements,
	type PersonalSourceLinkProps,
	PersonalSourceLink as SharedPersonalSourceLink,
} from "@carlnotes/core/components/PersonalSourceLink"
import { TOPIC_FINDING_NOTE_TOOLTIP } from "@carlnotes/core/lib/topicFindingCopy"
import { ExternalLink } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TopicResourceInfo } from "./TopicResourceInfo"

// reuse the normal Finding popover and source-link behavior without navigation
const ELEMENTS: PersonalSourceLinkElements = {
	Row: ({ children }) => <div className="flex min-w-0 items-center gap-2">{children}</div>,
	SourceLink: ({ url, label }) => (
		<AnchorLink
			href={url}
			isUserContent
			className="sentence-link inline-flex min-w-0 items-center gap-1 text-sm"
			title={label}
		>
			<span className="truncate">{label}</span>
			<ExternalLink aria-hidden className="size-3 shrink-0" />
		</AnchorLink>
	),
	Pending: ({ children }) => (
		<span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
			{children}
		</span>
	),
	FindingFrame: ({ isOpen, onOpenChange, label, children }) => (
		<Popover open={isOpen} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button type="button" variant="link" className="h-auto min-h-6 max-w-full p-0 text-sm text-link underline">
							<span className="truncate">{label}</span>
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				{!isOpen && <TooltipContent side="top">{TOPIC_FINDING_NOTE_TOOLTIP}</TooltipContent>}
			</Tooltip>
			{children}
		</Popover>
	),
	FindingDetails: ({ topic, resource, topicFeedHandlers }) => (
		<TopicResourceInfo
			topic={topic}
			resource={resource}
			topicFindingRank={null}
			isRatable={topic.canRate}
			isBookmarkable={topic.isTopicOwner || topic.isTeamMember}
			topicFeedHandlers={topicFeedHandlers}
		/>
	),
}

/**
 * Adapts source links to external tabs or an anchored Finding popover.
 */
export function PersonalSourceLink(props: PersonalSourceLinkProps) {
	return <SharedPersonalSourceLink {...props} elements={ELEMENTS} />
}
