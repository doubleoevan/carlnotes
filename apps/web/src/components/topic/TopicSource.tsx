// the sources editor's rows: one source row, and the default source row that is a source row when on
import { X } from "lucide-react"
import { Badge } from "@/components/primitives/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/** One default source row: a source row while on, and a + turn-on button while off. */
export function TopicDefaultSource({
	label,
	summary,
	isOn,
	onTurnOn,
	onTurnOff,
}: {
	label: string
	summary: string
	isOn: boolean
	onTurnOn: () => void
	onTurnOff: () => void
}) {
	if (!isOn) {
		return (
			<button type="button" onClick={onTurnOn} className={cn(STANDALONE_LINK_CLASS, "text-sm")}>
				+ {label}
			</button>
		)
	}
	return <TopicSource sourceKind={label} summary={summary} onRemoveTopicSource={onTurnOff} />
}

/** One source row in the sources editor. */
export function TopicSource({
	sourceKind,
	summary,
	screeningMessage,
	onRemoveTopicSource,
}: {
	sourceKind: string
	summary: string
	screeningMessage?: string | null
	onRemoveTopicSource: () => void
}) {
	return (
		<div className="flex items-center gap-2 text-sm">
			{/* the source kind pill */}
			<Badge variant="outline" className="shrink-0">
				{sourceKind}
			</Badge>
			{/* the config summary, with the screening message after it */}
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="text-muted-foreground min-w-0 flex-1 truncate">
						{summary || "—"}
						{screeningMessage && ` · ${screeningMessage}`}
					</span>
				</TooltipTrigger>
				{/* the whole summary, since the row cuts a long url short. hover only, as touch has no hover */}
				{summary && <TooltipContent className="max-w-72 wrap-anywhere">{summary}</TooltipContent>}
			</Tooltip>
			{/* ✕ to remove the source */}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={`Remove ${sourceKind} source`}
						onClick={onRemoveTopicSource}
						className="text-muted-foreground hover:text-foreground shrink-0"
					>
						<X className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent>Delete source</TooltipContent>
			</Tooltip>
		</div>
	)
}
