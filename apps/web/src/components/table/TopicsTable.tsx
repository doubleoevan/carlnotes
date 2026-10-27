import { fetchTopicPage } from "@carlnotes/client/topicClient"
import type { Topic } from "@carlnotes/contracts/profiles"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { DataTable } from "@carlnotes/core/components/DataTable"
import { useTopicEmails } from "@carlnotes/core/hooks/useTopicEmails"
import { topicSortValues, toTopicsTableColumns } from "@carlnotes/core/lib/topicsTableColumns"
import { cn } from "@carlnotes/nightshift/classNames"
import { X } from "lucide-react"
import { useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TopicInfo } from "@/components/topic/TopicInfo"
import { POPOVER_PANEL_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { DATA_TABLE_ELEMENTS } from "./DataTable"
import { TopicVisibility } from "./OwnerTopicsTable"
import { TableCard } from "./TableCard"
import { SMALLEST_PAGE_SIZE, TablePagination, usePaginatedRowSort } from "./TablePagination"
import { TopicNameLink } from "./TopicNameLink"

// share column content and email state; keep DOM popovers and routing local
export function TopicsTable({
	topics,
	includesNonPublicTopics,
	topicTooltip,
	onRemoveTopic,
	className,
}: {
	topics: Topic[]
	includesNonPublicTopics: boolean
	topicTooltip?: string
	onRemoveTopic?: (topic: Topic) => void
	className?: string
}) {
	const { renderedRows, sort, pagination } = usePaginatedRowSort({ rows: topics, valueByKey: topicSortValues })
	const emails = useTopicEmails()
	const columns = toTopicsTableColumns({
		topics,
		includesNonPublicTopics,
		topicTooltip,
		renderText: (text) => <span className="text-muted-foreground">{text}</span>,
		renderName: (topic) => <TopicNameLink topic={topic} />,
		renderVisibility: (topic) => <TopicVisibility visibility={topic.visibility} />,
		renderInfo: (topic) => <TopicPopover topic={topic} />,
		renderEmail: (topic) => (
			<Switch
				aria-label={`Email me ${topic.name}`}
				checked={emails.choices[topic.id] ?? topic.isEmailEnabled ?? false}
				disabled={emails.pending[topic.id]}
				onCheckedChange={(isEnabled) => void emails.setEmail(topic.id, isEnabled)}
			/>
		),
		renderActive: onRemoveTopic
			? (topic) => (
					<Switch checked aria-label={`Deactivate ${topic.name}`} onCheckedChange={() => onRemoveTopic(topic)} />
				)
			: undefined,
		renderRemove: onRemoveTopic
			? (topic) => (
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label={`Remove ${topic.name} from the team`}
						onClick={() => onRemoveTopic(topic)}
					>
						<X className="size-4" />
					</Button>
				)
			: undefined,
	})
	if (topics.length === 0) {
		return null
	}
	return (
		<TableCard className={cn("mb-4", className)}>
			<DataTable
				columns={columns}
				renderedRows={renderedRows}
				getRowId={(topic) => topic.id}
				sort={sort}
				elements={DATA_TABLE_ELEMENTS}
			/>
			{topics.length > SMALLEST_PAGE_SIZE && <TablePagination {...pagination} />}
			{emails.error && <p className="text-destructive text-sm">{emails.error}</p>}
		</TableCard>
	)
}

/**
 * The kept-over-seen cell, which opens that Topic's info popup instead of navigating away.
 * The topic info is fetched when the popover opens.
 */
function TopicPopover({ topic }: { topic: Topic }) {
	const [topicInfo, setTopicInfo] = useState<TopicResponse | null>(null)

	// only fetch the topic info when the popover is first opened
	function handleOpenChange(isOpen: boolean): void {
		if (isOpen && !topicInfo) {
			// a gated topic has no payload to show in the popover, which leaves it empty
			fetchTopicPage(topic.id)
				.then((result) => setTopicInfo(result.status === "visible" ? result.topic : null))
				.catch((error) => console.error("topic info load failed", error))
		}
	}

	// the kept and seen counts the cell shows, which start its accessible name
	const keptOverSeenLabel = `${topic.keptCount.toLocaleString()} / ${topic.seenCount.toLocaleString()}`
	return (
		<Popover onOpenChange={handleOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						aria-label={`${keptOverSeenLabel} kept, topic roast for ${topic.name}`}
						className={cn(STANDALONE_LINK_CLASS, "inline-flex items-center gap-1.5")}
					>
						{keptOverSeenLabel}
						<NoteIcon className="size-5" />
					</PopoverTrigger>
				</TooltipTrigger>
				{/* the cell reads kept-first to match its heading, so the tooltip spells both out in words */}
				<TooltipContent>
					Kept {topic.keptCount.toLocaleString()} out of {topic.seenCount.toLocaleString()} findings
				</TooltipContent>
			</Tooltip>
			{/* the topic info popup */}
			<PopoverContent align="end" className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				{topicInfo ? <TopicInfo topic={topicInfo} /> : <CoffeeLoading />}
			</PopoverContent>
		</Popover>
	)
}
