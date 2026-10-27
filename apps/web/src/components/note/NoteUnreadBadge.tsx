import {
	type NoteUnreadBadgeElements,
	type NoteUnreadBadgeProps,
	NoteUnreadBadge as SharedNoteUnreadBadge,
} from "@carlnotes/core/components/NoteUnreadBadge"
import { toNoteBadgeDetails } from "@carlnotes/core/lib/noteBadges"
import { usePageNoteBadges } from "@carlnotes/core/stores/noteBadgeStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

// preserve the row's hover explanation and compact badge appearance
const ELEMENTS: NoteUnreadBadgeElements = {
	Container: ({ children, label, details }) => (
		<Tooltip>
			<TooltipTrigger asChild>
				<span role="img" aria-label={label}>
					{children}
				</span>
			</TooltipTrigger>
			<TooltipContent>
				<ul className="list-disc pl-4">
					{details.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
			</TooltipContent>
		</Tooltip>
	),
	Count: ({ children, isOutline }) => (
		<span
			className={cn(
				"flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
				isOutline ? "border border-primary text-link" : "bg-primary text-primary-foreground",
			)}
		>
			{children}
		</span>
	),
}

/**
 * Draws shared note badge content in the existing browser tooltip.
 */
export function NoteUnreadBadge(props: NoteUnreadBadgeProps) {
	return <SharedNoteUnreadBadge {...props} elements={ELEMENTS} />
}

/**
 * Combines a page's note changes beside the Tasting Notes heading.
 */
export function PageNoteBadge({ pageType, pageId }: { pageType: "topic" | "team"; pageId: string }) {
	const badges = usePageNoteBadges(pageType === "topic" ? pageId : null, pageType === "team" ? pageId : undefined)
	const counts = badges.reduce(
		(sum, badge) => ({
			unreadEdits: sum.unreadEdits + badge.unreadEdits,
			unreadComments: sum.unreadComments + badge.unreadComments,
		}),
		{ unreadEdits: 0, unreadComments: 0 },
	)
	return <NoteUnreadBadge {...counts} details={toNoteBadgeDetails(badges)} isOutline />
}
