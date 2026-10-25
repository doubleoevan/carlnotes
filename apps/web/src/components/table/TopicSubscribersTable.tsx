import { fetchAdminTopicSubscribers } from "@carlnotes/client/billingClient"
import type { AdminTopicSubscriberRow } from "@carlnotes/contracts/admin"
import { MINUTE_MS } from "@carlnotes/contracts/time"
import { toCountLabel, toDateLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { useQuery } from "@tanstack/react-query"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { SUBTABLE_CARD_CLASS, TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { SortableHeader } from "./SortableHeader"
import { TableCard } from "./TableCard"
import { TablePagination, usePaginatedRowSort } from "./TablePagination"
import { UserEmailLink, UserNameLink, UserPlanLink } from "./UserLinks"

// the sort accessors for the subscribers table columns
const topicSubscriberSortValues = {
	subscriber: (topicSubscriber: AdminTopicSubscriberRow) => topicSubscriber.username,
	email: (topicSubscriber: AdminTopicSubscriberRow) => topicSubscriber.email,
	plan: (topicSubscriber: AdminTopicSubscriberRow) => topicSubscriber.plan,
	signup: (topicSubscriber: AdminTopicSubscriberRow) => topicSubscriber.signedUpAt,
	lastLogin: (topicSubscriber: AdminTopicSubscriberRow) => topicSubscriber.lastLoginAt ?? "",
	subscribed: (topicSubscriber: AdminTopicSubscriberRow) => topicSubscriber.subscribedAt,
	emails: (topicSubscriber: AdminTopicSubscriberRow) => (topicSubscriber.isEmailEnabled ? 1 : 0),
	emailed: (topicSubscriber: AdminTopicSubscriberRow) => topicSubscriber.emailCount,
	lastEmail: (topicSubscriber: AdminTopicSubscriberRow) => topicSubscriber.lastEmailedAt ?? "",
}

/**
 * A topic's subscribers in the admin console, read when the table opens. It shows the loading mug until they arrive.
 */
export function TopicSubscribersTable({ topicId }: { topicId: string }) {
	// read the subscribers when the table opens, and reuse them on a reopen within a minute
	const { data: topicSubscribers, isError } = useQuery({
		queryKey: ["admin-topic-subscribers", topicId],
		queryFn: () => fetchAdminTopicSubscribers(topicId),
		staleTime: MINUTE_MS,
	})

	// show loaded subscribers even after a failed refetch, then the error message, then the loading mug
	if (topicSubscribers) {
		return <LoadedTopicSubscribersTable topicSubscribers={topicSubscribers} />
	}
	if (isError) {
		return <p className="text-muted-foreground py-2 text-sm">Couldn't load the followers.</p>
	}
	return <CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />
}

// a topic's loaded subscribers as a sortable, paged table with email totals
function LoadedTopicSubscribersTable({ topicSubscribers }: { topicSubscribers: AdminTopicSubscriberRow[] }) {
	// sort feeds pagination, so a sorted column reorders across every page. rows start in the api's newest-first order
	const { pageRows, sort, pagination } = usePaginatedRowSort(topicSubscribers, topicSubscriberSortValues)
	// the footer's email totals span every subscriber, not just the visible page
	const emailOnCount = topicSubscribers.filter((topicSubscriber) => topicSubscriber.isEmailEnabled).length
	const totalEmailCount = topicSubscribers.reduce((sum, topicSubscriber) => sum + topicSubscriber.emailCount, 0)
	return (
		<TableCard className={SUBTABLE_CARD_CLASS}>
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, "table-auto!")}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="subscriber" label="Follower" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="email" label="Email" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="plan" label="Plan" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="signup" label="Signup" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="lastLogin" label="Last login" className="py-2 pr-4" />
							<SortableHeader sort={sort} sortKey="subscribed" label="Followed" className="py-2 pr-4" />
							<SortableHeader
								sort={sort}
								sortKey="emails"
								label="Emails"
								tooltip="Whether the topic's emails reach this follower"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="emailed"
								label="Emailed"
								tooltip="Emails this follower received from the topic"
								className="py-2 pr-4"
							/>
							<SortableHeader
								sort={sort}
								sortKey="lastEmail"
								label="Last email"
								tooltip="When the topic last emailed this follower"
								className="py-2"
							/>
						</tr>
					</thead>
					<tbody>
						{pageRows.map((topicSubscriber) => (
							<tr key={topicSubscriber.userId} className="border-b last:border-b-0">
								<td className="py-2 pr-4">
									<UserNameLink user={topicSubscriber} />
								</td>
								{/* the email links to the subscriber's activity page, and the plan to their account page */}
								<td className="py-2 pr-4">
									<UserEmailLink user={topicSubscriber} />
								</td>
								<td className="py-2 pr-4">
									<UserPlanLink user={topicSubscriber} />
								</td>
								<td className="py-2 pr-4">{toDateLabel(topicSubscriber.signedUpAt)}</td>
								{/* a subscriber who has not signed in since the column was added has no date to show */}
								<td className="py-2 pr-4">{toDateLabel(topicSubscriber.lastLoginAt)}</td>
								<td className="py-2 pr-4">{toDateLabel(topicSubscriber.subscribedAt)}</td>
								<td className="py-2 pr-4">{topicSubscriber.isEmailEnabled ? "on" : "off"}</td>
								<td className="py-2 pr-4">{topicSubscriber.emailCount}</td>
								<td className="py-2">{toDateLabel(topicSubscriber.lastEmailedAt)}</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">{`Total ${toCountLabel(topicSubscribers.length, "follower")}`}</td>
							<td colSpan={5} />
							<td className="py-2 pr-4">{`${emailOnCount}/${topicSubscribers.length} on`}</td>
							<td className="py-2 pr-4">{`${totalEmailCount} sent`}</td>
							<td />
						</tr>
					</tfoot>
				</table>
			</div>
			<TablePagination {...pagination} />
		</TableCard>
	)
}
