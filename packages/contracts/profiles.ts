// the profile contracts: a user's identity, a topic table row, a team's status on a profile, and the billing state
import { z } from "zod"
import { toSessionAvatarVersion } from "./avatars"
import { billingIntervals, billingProviders, plans, teamRoles, visibilities } from "./enums"
import { podcastEpisodeSummary } from "./podcast"
import { teamIdentity } from "./teamIdentity"
import { displayEnum } from "./tolerantReads"
import { imageRegenerationQuota } from "./topicImages"

// the two audiences an admin shows someone else's profile to. user reads it as the signed-in admin, which is the
// person's whole profile, and visitor reads it as a visitor
export const profileAudiences = ["user", "visitor"] as const

export type ProfileAudience = (typeof profileAudiences)[number]

// each audience as the admin's select names it
export const PROFILE_AUDIENCE_LABELS: Record<ProfileAudience, string> = {
	user: "User view",
	visitor: "Visitor view",
}

// a profile read's query, which reads as the signed-in user unless it names the visitor audience
export const profileQuery = z.object({ audience: z.enum(profileAudiences).default("user") })

// the user identity for a profile page link, with the avatar's source and the version that its url names
export const profileIdentity = z.object({
	userId: z.string(),
	username: z.string(),
	avatarSource: z.string().nullable(),
	avatarVersion: z.string().nullable(),
})

export type ProfileIdentity = z.infer<typeof profileIdentity>

// a user by id and username: who created a note, and a report's author and reporter
export const userIdentity = z.object({ id: z.string(), username: z.string() })

export type UserIdentity = z.infer<typeof userIdentity>

/**
 * Returns the signed-in user's identity for a profile link, read from the session user, with the avatar the user
 * sees: an upload shown to them alone, or the one everyone else sees.
 */
export function toSessionProfileIdentity(sessionUser: {
	id: string
	username?: string | null
	avatarSource?: string | null
	avatarKey?: string | null
	uncheckedAvatarKey?: string | null
}): ProfileIdentity {
	return {
		userId: sessionUser.id,
		username: sessionUser.username ?? "",
		avatarSource: sessionUser.avatarSource ?? null,
		avatarVersion: toSessionAvatarVersion(sessionUser),
	}
}

// one row in a profile or team page's topic table. subscriberCount is by Topic, which the footer sums
export const topic = z.object({
	id: z.string(),
	name: z.string(),
	// who may see the topic
	visibility: z.enum(visibilities),
	// when the Topic was created and last updated
	createdAt: z.string(),
	updatedAt: z.string(),
	// findings kept and resources seen, summed across every succeeded Scan the Topic has run
	keptCount: z.number(),
	seenCount: z.number(),
	subscriberCount: z.number(),
	// whether the user's own subscription emails them, null where they hold no subscription to switch
	isEmailEnabled: z.boolean().nullable(),
	// the topic's latest published podcast episode that the user may listen to, null without one
	latestPodcastEpisode: podcastEpisodeSummary.nullable(),
	// the owner, and the team that owns the topic if it is one the user may see named
	owner: profileIdentity,
	team: teamIdentity.nullable(),
})

export type Topic = z.infer<typeof topic>

// one of the user's teams on another user's profile, with the user's role there and the profile user's status there
const profileTeamStatus = z.object({
	teamId: z.string(),
	name: z.string(),
	avatarVersion: z.string().nullable(),
	// the role and the status each decide which invite action the row offers
	role: z.enum(teamRoles),
	status: z.enum(["member", "invited", "none"]),
	// the team's pending invite to the profile user, and whether the user may delete the invite.
	// a team leader may delete any invite, and a user may delete an invite that the user sent
	inviteId: z.string().nullable(),
	canDeleteInvite: z.boolean(),
})

export type ProfileTeamStatus = z.infer<typeof profileTeamStatus>

// what the profile team statuses route returns: the user's teams, each with the profile user's status there
export const profileTeamStatusesResponse = z.object({ teams: z.array(profileTeamStatus) })

// the account page's billing state
export const billingState = z.object({
	plan: displayEnum(plans),
	// how often the subscription bills. a free user has none and reads monthly for limit lookups
	billingInterval: z.enum(billingIntervals),
	// the subscription's payment status (e.g. active, past_due), or null for a free user with no subscription
	status: z.string().nullable(),
	hasPaymentMethod: z.boolean(),
	dailyScansUsed: z.number(),
	dailyScanLimit: z.number(),
	// who bills the subscription, or null for a free user, and whether a scan past the daily limit bills as overage
	provider: z.enum(billingProviders).nullable(),
	isOverageBillable: z.boolean(),
	// the id the app logs in to RevenueCat with before a store purchase or a restore
	revenueCatAppUserId: z.string().nullable(),
	// the topic image regenerations used this month against the plan's limit, null for an admin, who has none. optional,
	// so a released app reads a payload without it
	imageRegenerationQuota: imageRegenerationQuota.nullable().optional(),
})

export type BillingState = z.infer<typeof billingState>
