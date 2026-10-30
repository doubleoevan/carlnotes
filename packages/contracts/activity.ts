// the activity page contracts: the owner's topics with their scans, and the subscriptions table

import { z } from "zod"
import { chatMention } from "./chat"
import { frequencies, scanStatuses, visibilities } from "./enums"
import { inviteRow } from "./invites"
import { monthlyBudgetCutoff } from "./plans"
import { podcastEpisodeSummary } from "./podcast"
import { profileIdentity } from "./profiles"
import { teamIdentity } from "./teams"
import { displayEnum } from "./tolerantReads"

// one Scan row in an Activity topic's subtable
export const activityScan = z.object({
	id: z.string(),
	// the outcome and, for a failed scan, the recorded reason
	status: displayEnum(scanStatuses),
	error: z.string().nullable(),
	startedAt: z.string(),
	finishedAt: z.string().nullable(),
	// set if the user stopped the scan, which the recap line reads
	stoppedAt: z.string().nullable(),
	// what the scan found, kept, and cost
	foundCount: z.number(),
	keptCount: z.number(),
	costCents: z.number(),
})

export type ActivityScan = z.infer<typeof activityScan>

// one owned-Topic row on the Activity page, including its month Scans for the sub-table
export const ownerTopic = z.object({
	id: z.string(),
	name: z.string(),
	// who may see the topic, shown with the same icon the topic page's info card uses
	visibility: z.enum(visibilities),
	// the topic scan schedule: daily, weekdays, or weekly
	frequency: z.enum(frequencies),
	// the month-to-date figures and dates the row renders
	monthScanCount: z.number(),
	// active subscribers, counted the same way the feed and topic page count them. the owner's own row never counts
	subscriberCount: z.number(),
	createdAt: z.string(),
	updatedAt: z.string(),
	monthCostCents: z.number(),
	// how many emails the topic sent this month that resend accepted
	monthEmailCount: z.number(),
	// who owns the topic, and so whose subscription the Emails switch writes
	ownerUserId: z.string(),
	// the owner's own subscription decides whether this topic emails them
	isEmailEnabled: z.boolean(),
	scans: z.array(activityScan),
	// the user's unseen chat room mentions, latest first
	chatMentions: z.array(chatMention),
	// the topic's latest published podcast episode that the user may listen to, null without one
	latestPodcastEpisode: podcastEpisodeSummary.nullable(),
})

export type OwnerTopic = z.infer<typeof ownerTopic>

// one row of the Activity page's subscriptions table, kept until manually deleted
export const subscriptionRow = z.object({
	topicId: z.string(),
	name: z.string(),
	// the byline: the owning team where one exists, otherwise the topic's owner
	owner: profileIdentity,
	team: teamIdentity.nullable(),
	// an invite topic only shows findings from the next scan onward
	visibility: z.enum(visibilities),
	subscribedAt: z.string(),
	isActive: z.boolean(),
	isEmailEnabled: z.boolean(),
	// the invite this row stands for, when the user was invited and has not answered
	inviteId: z.string().nullable(),
	// the topic's latest published podcast episode that the user may listen to, null without one
	latestPodcastEpisode: podcastEpisodeSummary.nullable(),
})

export type SubscriptionRow = z.infer<typeof subscriptionRow>

// the Activity payload: whose it is, metered variable spend against the budget, owned topics,
export const activityResponse = z.object({
	// whose activity this is: the user's own, or the user an admin is viewing
	user: profileIdentity,
	// this month's spend in cents, split into scans, chat, and podcast episodes, and the monthly budget
	scanSpendCents: z.number(),
	chatSpendCents: z.number(),
	podcastEpisodeSpendCents: z.number(),
	budgetCents: z.number(),
	// the monthly budget cutoffs, lowest share first
	monthlyBudgetCutoffs: z.array(monthlyBudgetCutoff),
	topics: z.array(ownerTopic),
	subscriptions: z.array(subscriptionRow),
	invites: z.array(inviteRow),
})

export type ActivityResponse = z.infer<typeof activityResponse>
