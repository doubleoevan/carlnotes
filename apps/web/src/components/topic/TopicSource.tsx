import {
	TopicDefaultSource as SharedTopicDefaultSource,
	TopicSource as SharedTopicSource,
	type TopicDefaultSourceProps,
	type TopicSourceElements,
	type TopicSourceProps,
} from "@carlnotes/core/components/TopicSource"
import { cn } from "@carlnotes/nightshift/classNames"
import { X } from "lucide-react"
import { Badge } from "@/components/primitives/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

/**
 * Renders the shared default Source row with the web's add and remove controls.
 */
export function TopicDefaultSource(props: TopicDefaultSourceProps) {
	return <SharedTopicDefaultSource {...props} elements={ELEMENTS} />
}

/**
 * Renders the shared Source row with Nightshift badges and summary tooltips.
 */
export function TopicSource(props: TopicSourceProps) {
	return <SharedTopicSource {...props} elements={ELEMENTS} />
}

// preserve the browser's compact row and hover details
const ELEMENTS: TopicSourceElements = {
	Row: ({ children }) => <div className="flex items-center gap-2 text-sm">{children}</div>,
	Kind: ({ sourceKind }) => (
		<Badge variant="outline" className="shrink-0">
			{sourceKind}
		</Badge>
	),
	Summary: ({ summary, children }) => (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="text-muted-foreground min-w-0 flex-1 truncate">{children}</span>
			</TooltipTrigger>
			{summary && <TooltipContent className="max-w-72 wrap-anywhere">{summary}</TooltipContent>}
		</Tooltip>
	),
	Remove: ({ label, onPress }) => (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					onClick={onPress}
					className="text-muted-foreground hover:text-foreground shrink-0"
				>
					<X className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent>Delete source</TooltipContent>
		</Tooltip>
	),
	Add: ({ label, onPress }) => (
		<button type="button" onClick={onPress} className={cn(STANDALONE_LINK_CLASS, "text-sm")}>
			{label}
		</button>
	),
}
