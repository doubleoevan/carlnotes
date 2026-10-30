// the profile contracts: a user's identity, a topic table row, a team's status on a profile, and the billing state
import { z } from "zod"
import { toAvatarVersion } from "./avatars"
import { billingIntervals, plans, teamRoles, visibilities } from "./enums"
import { podcastEpisodeSummary } from "./podcast"
import { displayEnum } from "./tolerantReads"

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
})

export type Topic = z.infer<typeof topic>

// one of the user's teams on another user's profile, with the user's role there and the profile user's status there
export const profileTeamStatus = z.object({
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
	// the Stripe payment status (e.g. active, past_due), or null for a free user with no subscription
	status: z.string().nullable(),
	hasPaymentMethod: z.boolean(),
	dailyScansUsed: z.number(),
	dailyScanLimit: z.number(),
})

export type BillingState = z.infer<typeof billingState>
