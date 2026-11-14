// the admin console contracts: its user, team, and topic subscriber rows, its totals, the mobile minimum versions, and
// the daily spend cutoffs with their settings

import type { MobilePlatform } from "./clientTelemetry"
import type { Plan } from "./plans"

// one platform's stored minimum app version, with when it was saved and by whom. the username is null once the
// saver's account closed
export type MobileMinimumVersionRow = {
	platform: MobilePlatform
	minimumVersion: string
	updatedAt: string
	updatedByUsername: string | null
}

// an admin-console user row: the user's status plus their attributed storage and month-to-date variable cost
export type AdminUserRow = {
	id: string
	email: string
	username: string
	// where the avatar comes from. oauth provider, uploaded by user, or generated username initials
	avatarSource: string
	avatarVersion: string | null
	role: string
	// whether an admin blocked the user from reactions and comments everywhere
	isAdminBlocked: boolean
	plan: Plan
	createdAt: string
	// when they last signed in, null until they sign in again
	lastLoginAt: string | null
	topicCount: number
	// how many teams the user actively belongs to, opening the table row's teams subtable
	teamCount: number
	// attributed storage in bytes over globally-deduplicated Resources
	attributedBytes: number
	// month-to-date variable cost in cents. null if the proxy is unreachable
	monthVariableCostCents: number | null
	// the app's own month-to-date totals in cents, split by what produced them
	scanSpendCents: number
	chatSpendCents: number
	// the per-user override in cents (null means the plan value), and the resulting monthly budget
	budgetOverrideCents: number | null
	budgetCents: number
}

// an admin-console topic subscriber row: the user's account, their subscription, and the topic's emails to them
export type AdminTopicSubscriberRow = {
	userId: string
	username: string
	avatarVersion: string | null
	email: string
	plan: Plan
	signedUpAt: string
	// when they last signed in, null until they sign in again
	lastLoginAt: string | null
	subscribedAt: string
	isEmailEnabled: boolean
	emailCount: number
	// when the topic last emailed them, null if an email was never sent
	lastEmailedAt: string | null
}

// an admin-console team row: the team's status, who leads it, and month-to-date spend on its topics
export type AdminTeamRow = {
	teamId: string
	name: string
	isPublic: boolean
	createdAt: string
	// the version of its own uploaded image, or null for the initials and tint drawn from its name and id
	avatarVersion: string | null
	memberCount: number
	topicCount: number
	// month-to-date spend in cents across the team's topics, split by what produced it
	scanSpendCents: number
	chatSpendCents: number
}

// the admin-console totals: platform-wide storage and variable cost, Stripe net revenue, and the derived contribution
export type AdminTotals = {
	attributedBytes: number
	monthVariableCostCents: number
	// Stripe's reporting/balance figure that already nets refunds, proration, and fees. null if unavailable
	netRevenueCents: number | null
	// net revenue minus tracked variable cost and an optional fixed cost
	contributionCents: number | null
}

// the kinds of free spending a daily spend cutoff pauses: a free user's repeat podcast episodes, their scheduled scans,
// and their chat with carl
export type DailySpendCutoffKind = "podcastEpisodes" | "scheduledScans" | "chat"

// the spend controls in effect: each daily spend cutoff in cents, how many waiting scans one sweep starts, how many
// signups in an hour send an alert, how many generated images one film may draw, and the switches
export type SpendControlSettings = {
	podcastEpisodesCutoffCents: number
	scheduledScansCutoffCents: number
	chatCutoffCents: number
	firstScanDispatchLimit: number
	hourlySignupAlertCount: number
	generatedChapterImageLimit: number
	// whether an unverified password account's first and manual scans wait for the first scan dispatch limit, and its
	// chat and voice requests are rejected
	isUnverifiedFirstScanLimitOn: boolean
	// whether a Scan records no new podcast episode, and whether a new podcast episode starts no film
	isPodcastEpisodeRecordingPaused: boolean
	isTopicPodcastEpisodeVideoRenderingPaused: boolean
	// whether the home's card sections hold only the items an admin pinned
	isHomePinnedOnly: boolean
}

// one numeric spend control on the admin console: the value in effect, its default, and whether an override replaced it
export type AdminSpendControlSetting = { value: number; defaultValue: number; isOverridden: boolean }

// the parts of the worst case free-plan spend for the UTC month: the sum of the free users' monthly budgets in cents,
// and the signups of each of the past 30 days, today's first
export type WorstCaseMonthlySpend = { freeUserBudgetCents: number; dailySignupCounts: number[] }

// the admin console's daily spend card: today's free-plan spend, the worst case monthly spend, each cutoff and
// whether it is passed, the first scan dispatch limit with how many scans wait for it, the signup alert with the past
// hour's signups, the generated chapter image limit, the switches, and the last save
export type AdminDailySpendCutoffs = {
	// the spend so far today and the worst case for the month
	freePlanSpendCents: number
	worstCaseMonthlySpend: WorstCaseMonthlySpend
	// the settings with what each one counts
	cutoffs: (AdminSpendControlSetting & { kind: DailySpendCutoffKind; isPassed: boolean })[]
	firstScanDispatchLimit: AdminSpendControlSetting
	waitingScanCount: number
	hourlySignupAlertCount: AdminSpendControlSetting
	hourlySignupCount: number
	generatedChapterImageLimit: AdminSpendControlSetting
	// the unverified accounts switch, the two pauses, and the pinned-only home
	isUnverifiedFirstScanLimitOn: boolean
	isPodcastEpisodeRecordingPaused: boolean
	isTopicPodcastEpisodeVideoRenderingPaused: boolean
	isHomePinnedOnly: boolean
	// when the overrides were last saved and by whom. both are null before the first save, and the username is null
	// once the saver's account closed
	updatedAt: string | null
	updatedByUsername: string | null
}

// the admin-console payload: the users and teams tables with the totals summary
export type AdminConsoleResponse = {
	users: AdminUserRow[]
	teams: AdminTeamRow[]
	totals: AdminTotals
	mobileMinimumVersions: MobileMinimumVersionRow[]
	dailySpendCutoffs: AdminDailySpendCutoffs
}
