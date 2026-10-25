import { sendSubscriptionEmail } from "@carlnotes/client/topicClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import { frequencies, isDailyFrequency } from "@carlnotes/contracts/enums"
import { toCentsLabel, toCountLabel, toMonthYearLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronDown, Globe, Lock, Mail } from "lucide-react"
import { Fragment, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import {
	STANDALONE_LINK_CLASS,
	SUBTABLE_CARD_CLASS,
	TABLE_CLASS,
	TABLE_HEAD_CLASS,
	TABLE_SCROLL_CLASS,
} from "@/lib/styleClasses"
import { SortableHeader } from "./SortableHeader"
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

// the sort accessors for the owned-topics table columns
const topicSortValues = {
	name: (topic: OwnerTopic) => topic.name,
	scans: (topic: OwnerTopic) => topic.monthScanCount,
	subscribers: (topic: OwnerTopic) => topic.subscriberCount,
	created: (topic: OwnerTopic) => topic.createdAt,
	updated: (topic: OwnerTopic) => topic.updatedAt,
	visibility: (topic: OwnerTopic) => topic.visibility,
	// sorted by how often the topic scans instead of alphabetically, so the daily ones group at one end
	schedule: (topic: OwnerTopic) => frequencies.indexOf(topic.frequency),
	emailed: (topic: OwnerTopic) => topic.monthEmailCount,
	cost: (topic: OwnerTopic) => topic.monthCostCents,
}

/**
 * The topics table on the user's own profile, also opened as an admin subtable: sortable columns, cost last,
 * a totals line, and a cost-cell click opening that topic's scan history.
 * In the admin console, the subscriber count opens the topic's subscribers.
 */
export function OwnerTopicsTable({
	topics,
	onReloadPage,
	canListSubscribers = false,
	className,
}: {
	topics: OwnerTopic[]
	onReloadPage: () => void
	// whether the subscriber count opens the topic's subscribers
	canListSubscribers?: boolean
	// the card styles a caller overrides
	className?: string
}) {
	// the subtable open under each topic row, at most one per row
	const [openSubtableByTopicId, setOpenSubtableByTopicId] = useState<Record<string, TopicSubtable | undefined>>({})
	// the Emails column sorts on the owner's stored email preference
	const sortValues = { ...topicSortValues, emails: (topic: OwnerTopic) => (topic.isEmailEnabled ? 1 : 0) }
	// sort feeds pagination, so a sorted column reorders across every page
	const { pageRows, sort, pagination } = usePaginatedRowSort(topics, sortValues)

	// open a topic's subtable, closing its other one, or close it if it was already open
	function handleSubtableClick(topicId: string, topicSubtable: TopicSubtable): void {
		setOpenSubtableByTopicId((previous) => ({
			...previous,
			[topicId]: previous[topicId] === topicSubtable ? undefined : topicSubtable,
		}))
	}

	// the owner holds a subscription to their own topic, so this writes the same preference the subscriptions table does
	async function handleEmailChange(topic: OwnerTopic, isEmailEnabled: boolean): Promise<void> {
		// the row shows its owner's preference, so the switch writes that owner's subscription
		await sendSubscriptionEmail(topic.id, isEmailEnabled, topic.ownerUserId)
		onReloadPage()
	}

	if (topics.length === 0) {
		return <p className="text-muted-foreground text-sm">No topics yet.</p>
	}

	// column totals for the summary line span every topic, not just the visible page
	const totalScanCount = topics.reduce((sum, topic) => sum + topic.monthScanCount, 0)
	const totalEmailCount = topics.reduce((sum, topic) => sum + topic.monthEmailCount, 0)
	const totalCostCents = topics.reduce((sum, topic) => sum + topic.monthCostCents, 0)
	// this sums subscriptions instead of people, so one user following two topics counts twice
	const totalSubscriberCount = topics.reduce((sum, topic) => sum + topic.subscriberCount, 0)
	// weekdays counts as daily here because the plan's daily topic limit counts it this way
	const dailyTopicCount = topics.filter((topic) => isDailyFrequency(topic.frequency)).length
	// how many topics anyone can see, and how many send emails to their owner
	const publicTopicCount = topics.filter((topic) => topic.visibility === "public").length
	const emailOnCount = topics.filter((topic) => topic.isEmailEnabled).length
	return (
		<TableCard className={cn("mb-4", className)}>
			{/* in an admin subtable, the table keeps its own column widths and minimum width over the admin table's subtable
			    rules, and it scrolls inside its own box without widening the admin table's row */}
			<div className={cn(TABLE_SCROLL_CLASS, "contain-inline-size")}>
				<table className={cn(TABLE_CLASS, "min-w-2xl! table-auto!")}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="name" label="Topic" className="py-2 pr-4" />
							<SortableHeader
								sort={sort}
								sortKey="scans"
								label="Brews"
								tooltip="Brews this month"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="subscribers"
								label="Followers"
								tooltip="Active followers, not counting you"
								className="py-2 pr-4"
							/>
							<SortableHeader sort={sort} sortKey="created" label="Created" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="updated" label="Updated" className="py-2 pr-4" />
							<SortableHeader
								sort={sort}
								sortKey="visibility"
								label="Visibility"
								tooltip="Who may see this topic"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="schedule"
								label="Schedule"
								tooltip="How often Carl brews"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="emails"
								label="Emails"
								tooltip="Receive emails"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="emailed"
								label="Emailed"
								tooltip="Emails the owner received this month"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="cost"
								label="Cost"
								tooltip="Cost this month"
								className="py-2 text-right"
							/>
						</tr>
					</thead>
					<tbody>
						{pageRows.map((topic) => (
							<Fragment key={topic.id}>
								<tr className="border-b">
									<td className="py-2 pr-4">
										<TopicNameLink topic={topic} />
									</td>
									<td className="py-2 pr-4">{topic.monthScanCount}</td>
									{/* in the admin console, the subscriber count also opens and closes this topic's subscribers */}
									<td className="py-2 pr-4">
										{canListSubscribers ? (
											<SubtableCountButton
												count={topic.subscriberCount}
												isOpen={openSubtableByTopicId[topic.id] === "subscribers"}
												ariaLabel={`Show ${topic.name}'s followers`}
												onClick={() => handleSubtableClick(topic.id, "subscribers")}
											/>
										) : (
											topic.subscriberCount
										)}
									</td>
									<td className="py-2 pr-4">{toMonthYearLabel(topic.createdAt)}</td>
									<td className="py-2 pr-4">{toMonthYearLabel(topic.updatedAt)}</td>
									<td className="py-2 pr-4">
										<TopicVisibility visibility={topic.visibility} />
									</td>
									<td className="py-2 pr-4 capitalize">{topic.frequency}</td>
									<td className="py-2 pr-4">
										<Switch
											checked={topic.isEmailEnabled}
											onCheckedChange={(isOn) => handleEmailChange(topic, isOn)}
											aria-label={`${topic.name} emails`}
										/>
									</td>
									<td className="py-2 pr-4">{topic.monthEmailCount}</td>
									{/* the cost cell also opens and closes this topic's scans */}
									<td className="py-2 text-right">
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={() => handleSubtableClick(topic.id, "scans")}
													className={cn(STANDALONE_LINK_CLASS, "inline-flex items-center gap-0.5")}
												>
													{toCentsLabel(topic.monthCostCents)}
													{/* the chevron shows whether the scan costs table is open or closed */}
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
									</td>
								</tr>
								{/* the topic's open subtable under the row, its scans or its subscribers */}
								{openSubtableByTopicId[topic.id] && (
									<tr className="border-b">
										<td colSpan={10} className="py-2">
											{openSubtableByTopicId[topic.id] === "scans" ? (
												<TopicScansTable scans={topic.scans} topic={topic} />
											) : (
												<TopicSubscribersTable topicId={topic.id} />
											)}
										</td>
									</tr>
								)}
							</Fragment>
						))}
					</tbody>
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">Total</td>
							<td className="py-2 pr-4">{toCountLabel(totalScanCount, "brew")}</td>
							<td className="py-2 pr-4">{toCountLabel(totalSubscriberCount, "follower")}</td>
							<td colSpan={2} />
							<td className="py-2 pr-4">{`${publicTopicCount}/${topics.length} public`}</td>
							<td className="py-2 pr-4">{`${dailyTopicCount} daily`}</td>
							<td className="py-2 pr-4">{`${emailOnCount}/${topics.length} on`}</td>
							<td className="py-2 pr-4">{`${totalEmailCount} sent`}</td>
							<td className="py-2 text-right">{toCentsLabel(totalCostCents)}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<TablePagination {...pagination} />
		</TableCard>
	)
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
