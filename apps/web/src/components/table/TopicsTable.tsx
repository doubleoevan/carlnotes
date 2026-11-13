import { fetchTopicPage } from "@carlnotes/client/topicClient"
import type { Topic } from "@carlnotes/contracts/profiles"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { DataTable } from "@carlnotes/core/components/DataTable"
import { TopicsTable as SharedTopicsTable, type TopicsTableElements } from "@carlnotes/core/components/TopicsTable"
import { toRemoveTopicConfirmation } from "@carlnotes/core/lib/confirmationCopy"
import { toKeptOverSeenLabel, topicSortValues } from "@carlnotes/core/lib/topicsTableColumns"
import { cn } from "@carlnotes/nightshift/classNames"
import { X } from "lucide-react"
import { type ComponentProps, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TopicInfo } from "@/components/topic/TopicInfo"
import { useConfirmDialog } from "@/hooks/useConfirmDialog"
import { POPOVER_PANEL_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { DATA_TABLE_ELEMENTS } from "./DataTable"
import { TopicVisibility } from "./OwnerTopicsTable"
import { TableCard } from "./TableCard"
import { SMALLEST_PAGE_SIZE, TablePagination, usePaginatedRowSort } from "./TablePagination"
import { TopicNameLink } from "./TopicNameLink"

/**
 * A profile's or a team's topics in the web's table card. A team leader's remove asks first.
 */
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
	// taking a topic off the team asks first
	const { confirm, confirmDialog } = useConfirmDialog()
	const handleRemoveTopic = (topic: Topic): void => {
		confirm(toRemoveTopicConfirmation({ topicName: topic.name }), () => onRemoveTopic?.(topic))
	}
	return (
		<>
			<SharedTopicsTable
				topics={topics}
				includesNonPublicTopics={includesNonPublicTopics}
				topicTooltip={topicTooltip}
				onRemoveTopic={onRemoveTopic && handleRemoveTopic}
				className={className}
				elements={TOPICS_TABLE_ELEMENTS}
			/>
			{confirmDialog}
		</>
	)
}

// the table card with the sorted page of rows and the pagination under it
function TopicsTableCard({ topics, columns, className, children }: ComponentProps<TopicsTableElements["Table"]>) {
	const { renderedRows, sort, pagination } = usePaginatedRowSort({ rows: topics, valueByKey: topicSortValues })
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
			{children}
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
	const keptOverSeenLabel = toKeptOverSeenLabel(topic)
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

// the web's DOM cells: muted text, the name link, switches, and the ghost remove button
export const TOPICS_TABLE_ELEMENTS: TopicsTableElements = {
	Table: TopicsTableCard,
	Text: ({ children }) => <span className="text-muted-foreground">{children}</span>,
	ErrorText: ({ children }) => <p className="text-destructive text-sm">{children}</p>,
	NameLink: TopicNameLink,
	Visibility: TopicVisibility,
	TopicInfo: TopicPopover,
	Switch: ({ label, isChecked, isDisabled, onChange }) => (
		<Switch aria-label={label} checked={isChecked} disabled={isDisabled} onCheckedChange={onChange} />
	),
	RemoveButton: ({ label, onPress }) => (
		<Button size="icon-sm" variant="ghost" aria-label={label} onClick={onPress}>
			<X className="size-4" />
		</Button>
	),
}
