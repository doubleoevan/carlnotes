// the admin console contracts: its user, team, and topic subscriber rows, its totals, and the mobile minimum versions
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
	// how many blocks users hold between them
	blockCount: number
}

// the admin-console payload: the users and teams tables with the totals summary
export type AdminConsoleResponse = {
	users: AdminUserRow[]
	teams: AdminTeamRow[]
	totals: AdminTotals
	mobileMinimumVersions: MobileMinimumVersionRow[]
}
