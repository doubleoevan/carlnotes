// the profile contracts: a user's identity, the profile page, a topic table row, and the billing state
import { z } from "zod"
import { toAvatarVersion } from "./avatars"
import type { visibilities } from "./enums"
import type { BillingInterval, Plan } from "./plans"
import type { PodcastEpisodeSummary } from "./podcast"
import type { TeamSummary } from "./teams"

// the user identity for a profile page link, with the avatar's source and the version that its url names
export const profileIdentity = z.object({
	userId: z.string(),
	username: z.string(),
	avatarSource: z.string().nullable(),
	avatarVersion: z.string().nullable(),
})

export type ProfileIdentity = z.infer<typeof profileIdentity>

/**
 * Returns the signed-in user's identity for a profile link, read from the session user.
 */
export function toSessionProfileIdentity(sessionUser: {
	id: string
	username?: string | null
	avatarSource?: string | null
	avatarKey?: string | null
}): ProfileIdentity {
	return {
		userId: sessionUser.id,
		username: sessionUser.username ?? "",
		avatarSource: sessionUser.avatarSource ?? null,
		avatarVersion: toAvatarVersion(sessionUser),
	}
}

// one row in a profile or team page's topic table. subscriberCount is by Topic, which the footer sums
export type Topic = {
	id: string
	name: string
	// who may see the topic
	visibility: (typeof visibilities)[number]
	// when the Topic was created and last updated
	createdAt: string
	updatedAt: string
	// findings kept and resources seen, summed across every succeeded Scan the Topic has run
	keptCount: number
	seenCount: number
	subscriberCount: number
	// whether the user's own subscription emails them, null where they hold no subscription to switch
	isEmailEnabled: boolean | null
	// the topic's latest published podcast episode that the user may listen to, null without one
	latestPodcastEpisode: PodcastEpisodeSummary | null
}

export type ProfileResponse = {
	// the avatar's tint is seeded from the user id, so the id is included with the profile
	userId: string
	username: string
	// where the avatar comes from. oauth provider, uploaded by user, or generated username initials
	avatarSource: string
	avatarVersion: string | null
	joinedAt: string
	// distinct people, not summed rows. the same person subscribed to multiple Topics counts once here
	subscriberCount: number
	// whether the topics below include the user's private and invite ones, which only the owner and an admin view
	includesNonPublicTopics: boolean
	topics: Topic[]
	// the teams this user belongs to. their own profile lists them all
	teams: TeamSummary[]
}

// one of the user's teams on another user's profile, with the user's role there and the profile user's status there
export type ProfileTeamStatus = {
	teamId: string
	name: string
	avatarVersion: string | null
	role: "leader" | "member"
	status: "member" | "invited" | "none"
	// the team's pending invite to the profile user, and whether the user may delete the invite.
	// a team leader may delete any invite, and a user may delete an invite that the user sent
	inviteId: string | null
	canDeleteInvite: boolean
}

// the account page's billing state
export type BillingState = {
	plan: Plan
	// how often the subscription bills. a free user has none and reads monthly for limit lookups
	billingInterval: BillingInterval
	// the Stripe payment status (e.g. active, past_due), or null for a free user with no subscription
	status: string | null
	hasPaymentMethod: boolean
	dailyScansUsed: number
	dailyScanLimit: number
}
