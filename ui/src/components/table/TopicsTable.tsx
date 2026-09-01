import type { Topic, TopicResponse } from "@shared/contracts"
import { X } from "lucide-react"
import { useState } from "react"
import { fetchTopicPage, sendSubscriptionEmail } from "@/clients/topicClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Switch } from "@/components/primitives/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TopicVisibility } from "@/components/table/OwnerTopicsTable"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard } from "@/components/table/TableCard"
import { SMALLEST_PAGE_SIZE, TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { TopicInfo } from "@/components/topic/TopicInfo"
import { TopicMentionBadge } from "@/components/topic/TopicMentionBadge"
import { toMonthYearLabel } from "@/lib/labels"
import { POPOVER_PANEL_CLASS, TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the sort accessors for the topic columns
const topicSortValues = {
	topic: (topic: Topic) => topic.name,
	created: (topic: Topic) => topic.createdAt,
	updated: (topic: Topic) => topic.updatedAt,
	// "kept" divided by "seen" sorts the ratio
	kept: (topic: Topic) => (topic.seenCount > 0 ? topic.keptCount / topic.seenCount : 0),
	subscribers: (topic: Topic) => topic.subscriberCount,
	visibility: (topic: Topic) => topic.visibility,
	emails: (topic: Topic) => (topic.isEmailEnabled ? 1 : 0),
}

/**
 * The one topic table the profile page and the team pages share: each topic with its dates,
 * visibility, follower count, and kept-over-seen figures. The team page adds the Active column by
 * passing a detach handler, and each page owns its card and its empty state.
 */
export function TopicsTable({
	topics,
	includesNonPublicTopics,
	topicTooltip,
	onRemoveTopic,
	className,
}: {
	topics: Topic[]
	// whether the visibility column renders
	includesNonPublicTopics: boolean
	// what the topic column header's tooltip says
	topicTooltip?: string
	// removing a topic from the team, a leader's power on a team page alone
	onRemoveTopic?: (topic: Topic) => void
	// the card styles a caller overrides, like the sunken surface a subtable sits on
	className?: string
}) {
	// the sorted column applies across all the table's pages
	const { pageRows, sort, pagination } = usePaginatedRowSort(topics, topicSortValues)

	// the switch shows the choice before the page reloads, so the row shows the choice the moment it is made
	const [emailChoices, setEmailChoices] = useState<Record<string, boolean>>({})
	const toEmailChoice = (topic: Topic): boolean | null => emailChoices[topic.id] ?? topic.isEmailEnabled
	const handleEmailChange = (topicId: string, isEmailEnabled: boolean): void => {
		setEmailChoices((choices) => ({ ...choices, [topicId]: isEmailEnabled }))
		void sendSubscriptionEmail(topicId, isEmailEnabled).catch((error) => console.error("email change failed", error))
	}

	// the column renders only where the user follows at least one of these topics
	const isEmailShown = topics.some((topic) => topic.isEmailEnabled !== null)

	// the totals sum each topic's kept, seen, and subscriber counts, and count the public topics
	const totals = {
		kept: topics.reduce((sum, topic) => sum + topic.keptCount, 0),
		seen: topics.reduce((sum, topic) => sum + topic.seenCount, 0),
		subscribers: topics.reduce((sum, topic) => sum + topic.subscriberCount, 0),
		public: topics.filter((topic) => topic.visibility === "public").length,
	}

	// each page renders its own empty state in its own card
	if (topics.length === 0) {
		return null
	}

	return (
		<TableCard className={cn("mb-4", className)}>
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, "min-w-2xl")}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="topic" label="Topic" tooltip={topicTooltip} className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="created" label="Created" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="updated" label="Updated" className="py-2 pr-4" />
							{/* the visibility column renders only when the set can hold a non-public topic */}
							{includesNonPublicTopics && (
								<SortableHeader
									sort={sort}
									sortKey="visibility"
									label="Visibility"
									tooltip="Who may see this topic"
									className="py-2 pr-4"
								/>
							)}
							<SortableHeader
								sort={sort}
								sortKey="subscribers"
								label="Followers"
								tooltip="Topic followers"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="kept"
								label="Kept / reviewed"
								tooltip="Carl reviewed and kept these findings"
								className="py-2 pr-4"
							/>
							{/* a follower switches their own scan emails per topic, wherever the topic is listed */}
							{isEmailShown && (
								<SortableHeader
									sort={sort}
									sortKey="emails"
									label="Emails"
									tooltip="Email me this topic's scans"
									className="py-2 pr-4"
								/>
							)}
							{/* the Active column belongs to the team page's leader alone */}
							{onRemoveTopic && (
								<th className="py-2 pr-4 font-normal">
									<Tooltip>
										<TooltipTrigger asChild>
											<span>Active</span>
										</TooltipTrigger>
										<TooltipContent>Active team topics</TooltipContent>
									</Tooltip>
								</th>
							)}
							{onRemoveTopic && <th className="py-2" />}
						</tr>
					</thead>
					<tbody>
						{pageRows.map((topic) => (
							<tr key={topic.id} className="border-b">
								<td className="py-2 pr-4">
									{/* the chat mention count sits in the name's top-right corner while the user has unseen chat mentions */}
									<span className="relative inline-block">
										<AnchorLink href={`/topics/${topic.id}`} className="text-link hover:underline">
											{topic.name}
										</AnchorLink>
										<TopicMentionBadge topicId={topic.id} />
									</span>
								</td>
								<td className="text-muted-foreground py-2 pr-4">{toMonthYearLabel(topic.createdAt)}</td>
								<td className="text-muted-foreground py-2 pr-4">{toMonthYearLabel(topic.updatedAt)}</td>
								{includesNonPublicTopics && (
									<td className="py-2 pr-4">
										<TopicVisibility visibility={topic.visibility} />
									</td>
								)}
								<td className="py-2 pr-4">{topic.subscriberCount.toLocaleString()}</td>
								<td className="py-2 pr-4">
									<TopicPopover topic={topic} />
								</td>
								{isEmailShown && (
									<td className="py-2 pr-4">
										{toEmailChoice(topic) !== null && (
											<Switch
												checked={toEmailChoice(topic) ?? false}
												onCheckedChange={(isEmailEnabled) => handleEmailChange(topic.id, isEmailEnabled)}
												aria-label={`Email me ${topic.name}`}
											/>
										)}
									</td>
								)}
								{/* switching a topic off takes it off the team, the same thing the X does */}
								{onRemoveTopic && (
									<td className="py-2 pr-4">
										<Tooltip>
											{/* the trigger wraps the switch in a span. both write data-state to the same element otherwise */}
											<TooltipTrigger asChild>
												<span className="inline-flex">
													<Switch
														checked
														onCheckedChange={() => onRemoveTopic(topic)}
														aria-label={`Deactivate ${topic.name}`}
													/>
												</span>
											</TooltipTrigger>
											<TooltipContent>
												Deactivate <span className="font-semibold">{topic.name}</span>
											</TooltipContent>
										</Tooltip>
									</td>
								)}
								{/* the X returns the topic to its creator alone */}
								{onRemoveTopic && (
									<td className="py-2 text-right">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													size="icon-sm"
													variant="ghost"
													onClick={() => onRemoveTopic(topic)}
													aria-label={`Remove ${topic.name} from the team`}
												>
													<X className="size-4" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												Remove <span className="font-semibold">{topic.name}</span> from the team
											</TooltipContent>
										</Tooltip>
									</td>
								)}
							</tr>
						))}
					</tbody>
					{/* the footer sums the columns */}
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">Total</td>
							<td className="py-2 pr-4" colSpan={2} />
							{includesNonPublicTopics && <td className="py-2 pr-4">{`${totals.public}/${topics.length} public`}</td>}
							<td className="py-2 pr-4">
								{`${totals.subscribers.toLocaleString()} follower${totals.subscribers === 1 ? "" : "s"}`}
							</td>
							<td className="py-2 pr-4">
								{totals.kept.toLocaleString()} / {totals.seen.toLocaleString()} findings
							</td>
							{onRemoveTopic && <td className="py-2 pr-4">{`${topics.length}/${topics.length} active`}</td>}
							{onRemoveTopic && <td className="py-2" />}
						</tr>
					</tfoot>
				</table>
			</div>
			{topics.length > SMALLEST_PAGE_SIZE && <TablePagination {...pagination} />}
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

	return (
		<Popover onOpenChange={handleOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						aria-label={`Topic roast for ${topic.name}`}
						className="text-link inline-flex items-center gap-1.5 hover:underline"
					>
						{topic.keptCount.toLocaleString()} / {topic.seenCount.toLocaleString()}
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
