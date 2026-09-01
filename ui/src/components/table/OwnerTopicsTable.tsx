import type { ActivityScan, OwnerTopic } from "@shared/contracts"
import { frequencies, isDailyFrequency } from "@shared/enums"
import { ChevronDown, Globe, Lock, Mail } from "lucide-react"
import { Fragment, useState } from "react"
import { fetchScanNote, sendSubscriptionEmail } from "@/clients/topicClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard } from "@/components/table/TableCard"
import { TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { TopicMentionBadge } from "@/components/topic/TopicMentionBadge"
import { TopicScanRecap, toNotesMarkdown } from "@/components/topic/TopicScanRecap"
import { durationMsBetween, toCentsLabel, toCountLabel, toDurationLabel, toMonthYearLabel } from "@/lib/labels"
import { POPOVER_PANEL_CLASS, TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the icon and label each visibility reads as, matching the topic page's own info card
const VISIBILITY_METADATA = {
	private: { icon: Lock, label: "private" },
	public: { icon: Globe, label: "public" },
	invite: { icon: Mail, label: "invite" },
}

// the sort accessors for the owned-topics table columns
const topicSortValues = {
	name: (topic: OwnerTopic) => topic.name,
	scans: (topic: OwnerTopic) => topic.monthScanCount,
	subscribers: (topic: OwnerTopic) => topic.subscriberCount,
	created: (topic: OwnerTopic) => topic.createdAt,
	updated: (topic: OwnerTopic) => topic.updatedAt,
	visibility: (topic: OwnerTopic) => topic.visibility,
	// sorted by how often the topic brews instead of alphabetically, so the daily ones group at one end
	schedule: (topic: OwnerTopic) => frequencies.indexOf(topic.frequency),
	emailed: (topic: OwnerTopic) => topic.monthEmailCount,
	cost: (topic: OwnerTopic) => topic.monthCostCents,
}

/**
 * The Activity page's owned-topics table: sortable columns, cost last, a totals line, and a cost-cell click
 * opening that topic's scan history.
 */
export function OwnerTopicsTable({
	topics,
	onReloadPage,
	className,
}: {
	topics: OwnerTopic[]
	onReloadPage: () => void
	// the card styles a caller overrides
	className?: string
}) {
	const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(new Set())
	// the Emails column sorts on the owner's stored email preference
	const sortValues = { ...topicSortValues, emails: (topic: OwnerTopic) => (topic.isEmailEnabled ? 1 : 0) }
	// sort feeds pagination, so a sorted column reorders across every page
	const { pageRows, sort, pagination } = usePaginatedRowSort(topics, sortValues)

	// toggle one topic's scan history open or closed
	function handleCostCellClick(topicId: string): void {
		setExpandedTopicIds((previous) => withTopicId(previous, topicId, !previous.has(topicId)))
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
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, "min-w-2xl")}>
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
									<td className="py-2 pr-4">{topic.subscriberCount}</td>
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
													onClick={() => handleCostCellClick(topic.id)}
													className="text-link inline-flex items-center gap-0.5 hover:underline"
												>
													{toCentsLabel(topic.monthCostCents)}
													{/* the chevron shows whether the scan costs table is open or closed */}
													<ChevronDown
														aria-hidden="true"
														className={cn(
															"size-3.5 shrink-0 transition-transform",
															expandedTopicIds.has(topic.id) && "rotate-180",
														)}
													/>
												</button>
											</TooltipTrigger>
											<TooltipContent>Brew costs</TooltipContent>
										</Tooltip>
									</td>
								</tr>
								{expandedTopicIds.has(topic.id) && (
									<tr className="border-b">
										<td colSpan={10} className="py-2">
											<ScansTable scans={topic.scans} topic={topic} />
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

// the topic's name, linking to its page, with the user's chat mention count at its corner
function TopicNameLink({ topic }: { topic: OwnerTopic }) {
	return (
		<span className="relative inline-block">
			<AnchorLink href={`/topics/${topic.id}`} className="text-link hover:underline">
				{topic.name}
			</AnchorLink>
			<TopicMentionBadge topicId={topic.id} />
		</span>
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

// return a copy of the set with the id present or absent
function withTopicId(topicIds: Set<string>, topicId: string, isMember: boolean): Set<string> {
	const next = new Set(topicIds)
	if (isMember) {
		next.add(topicId)
	} else {
		next.delete(topicId)
	}
	return next
}

// the sort accessors for a topic's scans-this-month columns. time sorts by how long the scan took
const scanSortValues = {
	date: (scan: ActivityScan) => new Date(scan.startedAt).getTime(),
	read: (scan: ActivityScan) => scan.foundCount,
	kept: (scan: ActivityScan) => scan.keptCount,
	time: (scan: ActivityScan) => durationMsBetween(scan.startedAt, scan.finishedAt),
	cost: (scan: ActivityScan) => scan.costCents,
}

// a topic's scans this month: sortable columns, and a totals line, with pagination.
function ScansTable({ scans, topic }: { scans: OwnerTopic["scans"]; topic: Pick<OwnerTopic, "id" | "name"> }) {
	const { pageRows, sort, pagination } = usePaginatedRowSort(scans, scanSortValues)

	if (scans.length === 0) {
		return (
			<TableCard className="bg-sunken mb-0 shadow-none">
				<p className="text-muted-foreground text-sm">No brews this month.</p>
			</TableCard>
		)
	}

	// column totals for the summary line span every scan, not just the visible page
	const totalFoundCount = scans.reduce((sum, scan) => sum + scan.foundCount, 0)
	const totalKeptCount = scans.reduce((sum, scan) => sum + scan.keptCount, 0)
	const totalCostCents = scans.reduce((sum, scan) => sum + scan.costCents, 0)
	return (
		<TableCard className="bg-sunken mb-0 shadow-none">
			<div className={TABLE_SCROLL_CLASS}>
				<table className={TABLE_CLASS}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="date" label="Date" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="read" label="Read" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="kept" label="Kept" className="py-2 pr-4" />
							<SortableHeader
								sort={sort}
								sortKey="time"
								label="Brew time"
								tooltip="How long each brew took. Click a time for Carl's notes"
								className="py-2 pr-4"
							/>
							<SortableHeader sort={sort} sortKey="cost" label="Cost" className="py-2 text-right" />
						</tr>
					</thead>
					<tbody>
						{pageRows.map((scan) => (
							<tr key={scan.id} className="border-b">
								<td className="py-2 pr-4">{new Date(scan.startedAt).toLocaleDateString()}</td>
								<td className="py-2 pr-4">{scan.foundCount}</td>
								<td className="py-2 pr-4">{scan.keptCount}</td>
								<td className="py-2 pr-4">
									<ScanNotesCell scan={scan} topic={topic} />
								</td>
								<td className="py-2 text-right">{toCentsLabel(scan.costCents)}</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">Total</td>
							<td className="py-2 pr-4">{`${totalFoundCount} read`}</td>
							<td className="py-2 pr-4">{`${totalKeptCount} kept`}</td>
							<td className="py-2 pr-4" />
							<td className="py-2 text-right">{toCentsLabel(totalCostCents)}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<TablePagination {...pagination} />
		</TableCard>
	)
}

// the Brew time cell, the time taken as a link that opens the scan recap popover
function ScanNotesCell({ scan, topic }: { scan: ActivityScan; topic: Pick<OwnerTopic, "id" | "name"> }) {
	const duration = toDurationLabel(durationMsBetween(scan.startedAt, scan.finishedAt))
	// the scan recap is loaded on first open and kept while the row stays mounted
	const [scanSummary, setScanSummary] = useState<string | null>(null)
	const [isNoteLoaded, setIsNoteLoaded] = useState(false)
	function handleOpenScanNote(isOpen: boolean): void {
		if (isOpen && !isNoteLoaded) {
			fetchScanNote(scan.id)
				.then((note) => {
					setScanSummary(note)
					setIsNoteLoaded(true)
				})
				.catch((error) => console.error("scan note load failed", error))
		}
	}

	return (
		<Popover onOpenChange={handleOpenScanNote}>
			<PopoverTrigger className="text-link hover:underline">{duration || "—"}</PopoverTrigger>
			<PopoverContent align="start" className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				{isNoteLoaded ? (
					<TopicScanRecap
						scan={{ ...scan, costDollars: scan.costCents / 100, scanSummary }}
						copyMarkdown={toNotesMarkdown({ topicId: topic.id, topicName: topic.name, note: scanSummary })}
					/>
				) : (
					<CoffeeLoading className="min-h-24 text-base" />
				)}
			</PopoverContent>
		</Popover>
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
					<OwnerTopicsTable topics={topics} onReloadPage={onReloadPage} className="bg-sunken mb-0 shadow-none" />
				) : (
					<CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />
				)}
			</td>
		</tr>
	)
}
