// the activity page contracts: the owner's topics with their scans, and the subscriptions table
import type { frequencies, scanStatuses, visibilities } from "../enums"
import type { MonthlyBudgetCutoff } from "../plans"
import type { ChatMention } from "./chat"
import type { InviteRow } from "./invites"
import type { PodcastEpisodeSummary } from "./podcast"
import type { ProfileIdentity } from "./profiles"
import type { TeamIdentity } from "./teams"

// one Scan row in an Activity topic's subtable
export type ActivityScan = {
	id: string
	// the outcome and, for a failed scan, the recorded reason
	status: (typeof scanStatuses)[number]
	error: string | null
	startedAt: string
	finishedAt: string | null
	// set if the user stopped the scan, which the recap line reads
	stoppedAt: string | null
	// what the scan found, kept, and cost
	foundCount: number
	keptCount: number
	costCents: number
}

// one owned-Topic row on the Activity page, including its month Scans for the sub-table
export type OwnerTopic = {
	id: string
	name: string
	// who may see the topic, shown with the same icon the topic page's info card uses
	visibility: (typeof visibilities)[number]
	// the topic scan schedule: daily, weekdays, or weekly
	frequency: (typeof frequencies)[number]
	// the month-to-date figures and dates the row renders
	monthScanCount: number
	// active subscribers, counted the same way the feed and topic page count them. the owner's own row never counts
	subscriberCount: number
	createdAt: string
	updatedAt: string
	monthCostCents: number
	// how many emails the topic sent this month that resend accepted
	monthEmailCount: number
	// who owns the topic, and so whose subscription the Emails switch writes
	ownerUserId: string
	// the owner's own subscription decides whether this topic emails them
	isEmailEnabled: boolean
	scans: ActivityScan[]
	// the user's unseen chat room mentions, latest first
	chatMentions: ChatMention[]
	// the topic's latest published podcast episode that the user may listen to, null without one
	latestPodcastEpisode: PodcastEpisodeSummary | null
}

// one row of the Activity page's subscriptions table, kept until manually deleted
export type SubscriptionRow = {
	topicId: string
	name: string
	// the byline: the owning team where one exists, otherwise the topic's owner
	owner: ProfileIdentity
	team: TeamIdentity | null
	// an invite topic only shows findings from the next scan onward
	visibility: (typeof visibilities)[number]
	subscribedAt: string
	isActive: boolean
	isEmailEnabled: boolean
	// the invite this row stands for, when the user was invited and has not answered
	inviteId: string | null
	// the topic's latest published podcast episode that the user may listen to, null without one
	latestPodcastEpisode: PodcastEpisodeSummary | null
}

// the Activity payload: whose it is, metered variable spend against the budget, owned topics,
export type ActivityResponse = {
	// whose activity this is: the user's own, or the user an admin is viewing
	user: ProfileIdentity
	// this month's spend in cents, split into scans, chat, and podcast episodes, and the monthly budget
	scanSpendCents: number
	chatSpendCents: number
	podcastEpisodeSpendCents: number
	budgetCents: number
	// the monthly budget cutoffs, lowest share first
	monthlyBudgetCutoffs: MonthlyBudgetCutoff[]
	topics: OwnerTopic[]
	subscriptions: SubscriptionRow[]
	invites: InviteRow[]
}
