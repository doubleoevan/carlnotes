// the profile page contract: the user, their topic table, and the teams they belong to
import { z } from "zod"
import { topic } from "./profiles"
import { teamSummary } from "./teams"

// the profile page payload
export const profileResponse = z.object({
	// the avatar's tint is seeded from the user id, so the id is included with the profile
	userId: z.string(),
	username: z.string(),
	// where the avatar comes from. oauth provider, uploaded by user, or generated username initials
	avatarSource: z.string(),
	avatarVersion: z.string().nullable(),
	joinedAt: z.string(),
	// distinct people, not summed rows. the same person subscribed to multiple Topics counts once here
	subscriberCount: z.number(),
	// whether the topics below include the user's private and invite ones, which only the owner and an admin view
	includesNonPublicTopics: z.boolean(),
	// whether the signed-in user has blocked this person. false for a visitor and on the user's own profile
	isBlocked: z.boolean(),
	topics: z.array(topic),
	// the teams this user belongs to, as the teams summary rows them. their own profile lists them all
	teams: z.array(teamSummary),
})

export type ProfileResponse = z.infer<typeof profileResponse>
