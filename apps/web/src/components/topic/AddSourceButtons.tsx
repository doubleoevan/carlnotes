// the sources editor's add buttons: the add a source link and the Recommend button
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { cn } from "@carlnotes/nightshift/classNames"
import { Lightbulb } from "lucide-react"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// what the add-source buttons show once the topic has reached its source limit
export const FULL_SOURCES_NOTE = `Carl reads ${MAX_TOPIC_SOURCES} sources per topic. Drop one to add another.`

/** The link that opens the add-source picker. */
export function AddSourceLink({ isFull, onClick }: { isFull: boolean; onClick: () => void }) {
	const link = (
		<button
			type="button"
			onClick={onClick}
			disabled={isFull}
			className={cn(
				STANDALONE_LINK_CLASS,
				"text-sm disabled:cursor-default disabled:opacity-50 disabled:hover:no-underline",
			)}
		>
			+ add a source
		</button>
	)
	if (!isFull) {
		return link
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span>{link}</span>
			</TooltipTrigger>
			<TooltipContent>{FULL_SOURCES_NOTE}</TooltipContent>
		</Tooltip>
	)
}

/** The button that asks Carl to suggest sources, its tooltip saying how many it can add. */
export function RecommendButton({
	isFull,
	isDisabled,
	suggestionCount,
	onClick,
}: {
	isFull: boolean
	isDisabled: boolean
	suggestionCount: number
	onClick: () => void
}) {
	const suggestionNote = `Carl suggests up to ${suggestionCount} source${suggestionCount === 1 ? "" : "s"}`
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span>
					<Button variant="outline" size="sm" onClick={onClick} disabled={isFull || isDisabled}>
						<Lightbulb className="size-3.5" />
						Recommend
					</Button>
				</span>
			</TooltipTrigger>
			<TooltipContent>{isFull ? FULL_SOURCES_NOTE : suggestionNote}</TooltipContent>
		</Tooltip>
	)
}
