// a topic finding as its row shows it, and the metadata line under its title
import type { TopicFinding } from "@shared/contracts/findings"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { HostFavicon } from "@/components/common/HostFavicon"
import { PopoverTrigger } from "@/components/primitives/popover"
import { toAgeLabel } from "@/lib/labels"
import { cn, RESOURCE_KIND_ICON } from "@/lib/utils"

// the finding, whether its kind icon shows, and the children that come after the age on the metadata line
type TopicFindingSummaryProps = {
	resource: TopicFinding
	isResourceKindIconShown?: boolean
	className?: string
	children?: React.ReactNode
}

/**
 * A topic finding as its row shows it, with its kind icon, title, favicon, host, and age.
 * It renders inside a Popover, whose trigger is its title, and inside an element with the group class.
 */
export function TopicFindingSummary({
	resource,
	isResourceKindIconShown = true,
	className,
	children,
}: TopicFindingSummaryProps) {
	const ResourceIcon = RESOURCE_KIND_ICON[resource.resourceKind]
	// unread rows are bold and consumed rows are muted
	const titleClass = cn(
		"max-w-full truncate text-left text-sm group-hover:text-foreground",
		resource.isConsumed ? "text-muted-foreground font-normal" : "text-foreground font-semibold",
	)
	const metadataClass = cn(
		"mt-0.5 text-xs group-hover:text-foreground/80",
		resource.isConsumed ? "text-muted-foreground/70" : "text-muted-foreground",
	)
	return (
		<div className={cn("flex min-w-0 items-start gap-2.5", className)}>
			{/* the resource kind icon */}
			{isResourceKindIconShown && (
				<ResourceIcon
					className={cn(
						"mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground",
						resource.isConsumed && "opacity-60",
					)}
					aria-label={resource.resourceKind}
				/>
			)}
			<div className="min-w-0 flex-1">
				{/* the title opens the note, and links out in a browser without JavaScript.
				    the line is the title's height, level with the icon */}
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
				<div className={cn(metadataClass, "flex flex-wrap items-center gap-1.5")}>
					<ResourceMetadata resource={resource} />
					{children}
				</div>
			</div>
		</div>
	)
}

/**
 * The favicon, host, and age under a finding's title.
 */
export function ResourceMetadata({ resource }: { resource: TopicFinding }) {
	return (
		<>
			{resource.source && <HostFavicon faviconPath={resource.faviconPath} />}
			{[resource.source, toAgeLabel(resource.publishedAt)].filter(Boolean).join(" · ")}
		</>
	)
}
