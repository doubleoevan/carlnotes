import { sendSubscriptionEmail } from "@carlnotes/client/topicClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import { DataTable } from "@carlnotes/core/components/DataTable"
import { toCentsLabel } from "@carlnotes/core/lib/labels"
import { ownerTopicSortValues, toOwnerTopicsTableColumns } from "@carlnotes/core/lib/ownerTopicsTableColumns"
import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronDown, Globe, Lock, Mail } from "lucide-react"
import { useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { STANDALONE_LINK_CLASS, SUBTABLE_CARD_CLASS, TABLE_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { DATA_TABLE_ELEMENTS } from "./DataTable"
import { SubtableCountButton } from "./SubtableCountButton"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"
import { TopicNameLink } from "./TopicNameLink"
import { TopicScansTable } from "./TopicScansTable"
import { TopicSubscribersTable } from "./TopicSubscribersTable"

// the icon and label each visibility reads as, matching the topic page's own info card
const VISIBILITY_METADATA = {
	private: { icon: Lock, label: "private" },
	public: { icon: Globe, label: "public" },
	invite: { icon: Mail, label: "invite" },
}

// the subtable a topic row can open under itself, its scans or, in the admin console, its subscribers
type TopicSubtable = "scans" | "subscribers"

/**
 * Renders the shared owner topic table with web scan and subscriber subtables.
 */
export function OwnerTopicsTable({
	topics,
	onReloadPage,
	canListSubscribers = false,
	className,
}: {
	topics: OwnerTopic[]
	onReloadPage: () => void
	canListSubscribers?: boolean
	className?: string
}) {
	// keep each topic's expanded subtable through sorting and paging
	const [openSubtableByTopicId, setOpenSubtableByTopicId] = useState<Record<string, TopicSubtable | undefined>>({})
	const { pageRows, sort, pagination } = usePaginatedRowSort({ rows: topics, valueByKey: ownerTopicSortValues })
	function handleSubtableClick(topicId: string, topicSubtable: TopicSubtable): void {
		setOpenSubtableByTopicId((previous) => ({
			...previous,
			[topicId]: previous[topicId] === topicSubtable ? undefined : topicSubtable,
		}))
	}
	async function handleEmailChange(topic: OwnerTopic, isEmailEnabled: boolean): Promise<void> {
		await sendSubscriptionEmail(topic.id, isEmailEnabled, topic.ownerUserId)
		onReloadPage()
	}
	const columns = toOwnerTopicsTableColumns({
		topics,
		renderText: (text) => <span>{text}</span>,
		renderName: (topic) => <TopicNameLink topic={topic} />,
		renderSubscribers: (topic) =>
			canListSubscribers ? (
				<SubtableCountButton
					count={topic.subscriberCount}
					isOpen={openSubtableByTopicId[topic.id] === "subscribers"}
					ariaLabel={`Show ${topic.name}'s followers`}
					onClick={() => handleSubtableClick(topic.id, "subscribers")}
				/>
			) : (
				topic.subscriberCount
			),
		renderVisibility: (topic) => <TopicVisibility visibility={topic.visibility} />,
		renderEmail: (topic) => (
			<Switch
				checked={topic.isEmailEnabled}
				onCheckedChange={(isOn) => void handleEmailChange(topic, isOn)}
				aria-label={`${topic.name} emails`}
			/>
		),
		renderCost: (topic) => (
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => handleSubtableClick(topic.id, "scans")}
						className={cn(STANDALONE_LINK_CLASS, "inline-flex items-center gap-0.5")}
						aria-expanded={openSubtableByTopicId[topic.id] === "scans"}
					>
						{toCentsLabel(topic.monthCostCents)}
						<ChevronDown
							aria-hidden="true"
							className={cn(
								"size-3.5 shrink-0 transition-transform",
								openSubtableByTopicId[topic.id] === "scans" && "rotate-180",
							)}
						/>
					</button>
				</TooltipTrigger>
				<TooltipContent>Brew costs</TooltipContent>
			</Tooltip>
		),
	})
	if (!topics.length) {
		return <p className="text-muted-foreground text-sm">No topics yet.</p>
	}
	return (
		<TableCard className={cn("mb-4", className)}>
			<DataTable
				columns={columns}
				renderedRows={pageRows.map((row) => ({ row }))}
				getRowId={(topic) => topic.id}
				sort={sort}
				elements={OWNER_TABLE_ELEMENTS}
				renderDetails={(topic) =>
					openSubtableByTopicId[topic.id] ? (
						openSubtableByTopicId[topic.id] === "scans" ? (
							<TopicScansTable scans={topic.scans} topic={topic} />
						) : (
							<TopicSubscribersTable topicId={topic.id} />
						)
					) : null
				}
			/>
			<TablePagination {...pagination} />
		</TableCard>
	)
}

// preserve the admin subtable's independent sizing
const OWNER_TABLE_ELEMENTS = {
	...DATA_TABLE_ELEMENTS,
	Table: ({ children }: { children: React.ReactNode }) => (
		<div className={cn(TABLE_SCROLL_CLASS, "contain-inline-size")}>
			<table className={cn(TABLE_CLASS, "min-w-2xl! table-auto!")}>{children}</table>
		</div>
	),
}

// the topic's visibility with its icon
export function TopicVisibility({ visibility }: { visibility: OwnerTopic["visibility"] }) {
	const visibilityMetadata = VISIBILITY_METADATA[visibility]
	return (
		<span className="flex items-center gap-1.5">
			<visibilityMetadata.icon aria-hidden="true" className="size-3.5 shrink-0" />
			{visibilityMetadata.label}
		</span>
	)
}

/**
 * The row an admin table opens under a user or team: their topics once loaded, and the loading cup
 * until then.
 */
export function TopicsSubtableRow({
	topics,
	colSpan,
	onReloadPage,
}: {
	topics: OwnerTopic[] | null
	colSpan: number
	onReloadPage: () => void
}) {
	return (
		<tr className="border-b">
			<td colSpan={colSpan} className="py-2">
				{topics ? (
					<OwnerTopicsTable
						topics={topics}
						onReloadPage={onReloadPage}
						canListSubscribers
						className={SUBTABLE_CARD_CLASS}
					/>
				) : (
					<CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />
				)}
			</td>
		</tr>
	)
}
