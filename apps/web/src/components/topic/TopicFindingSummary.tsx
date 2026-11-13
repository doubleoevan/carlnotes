// a topic finding as its row shows it, and the metadata line under its title

import type { TopicFinding } from "@carlnotes/contracts/findings"
import {
	type ResourceMetadataComponents,
	ResourceMetadata as SharedResourceMetadata,
} from "@carlnotes/core/components/ResourceMetadata"
import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DOT_SEPARATED_TEXTS_ELEMENTS } from "@/components/common/DotSeparatedTexts"
import { HostFavicon } from "@/components/common/HostFavicon"
import { PopoverTrigger } from "@/components/primitives/popover"
import { ROW_METADATA_LINE_CLASS } from "@/lib/styleClasses"

// the finding, and the children that come after the age on the metadata line
type TopicFindingSummaryProps = {
	resource: TopicFinding
	className?: string
	children?: React.ReactNode
}

/**
 * Returns a finding's title classes. An unread title is bold and a read title is muted.
 */
export function toTopicFindingTitleClass(isConsumed: boolean): string {
	return cn(
		"group-hover:text-foreground",
		isConsumed ? "text-muted-foreground font-normal" : "text-foreground font-semibold",
	)
}

/**
 * A topic finding as its row shows it, with its title, favicon, host, and age.
 * It renders inside a Popover, whose trigger is its title, and inside an element with the group class.
 */
export function TopicFindingSummary({ resource, className, children }: TopicFindingSummaryProps) {
	const titleClass = cn("max-w-full truncate text-left text-sm", toTopicFindingTitleClass(resource.isConsumed))
	return (
		<div className={cn("min-w-0", className)}>
			{/* the title opens the note, and links out in a browser without JavaScript */}
			<div className="truncate text-sm">
				<PopoverTrigger asChild>
					<AnchorLink
						href={resource.url}
						isUserContent
						onClick={(event) => event.preventDefault()}
						className={titleClass}
					>
						{resource.title ?? resource.url}
					</AnchorLink>
				</PopoverTrigger>
			</div>
			{/* the metadata line, then the children */}
			<div className={ROW_METADATA_LINE_CLASS}>
				<ResourceMetadata resource={resource} />
				{children}
			</div>
		</div>
	)
}

/**
 * The favicon, host, and age under a finding's title.
 */
export function ResourceMetadata({ resource }: { resource: TopicFinding }) {
	return <SharedResourceMetadata resource={resource} components={RESOURCE_METADATA_COMPONENTS} />
}

// the favicon, and each text wrapping on its own
const RESOURCE_METADATA_COMPONENTS: ResourceMetadataComponents = {
	Favicon: HostFavicon,
	Text: DOT_SEPARATED_TEXTS_ELEMENTS.Text,
}
