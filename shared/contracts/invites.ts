// the invite contracts: an invite as its sender sees it, its sources and rejections, and its responses
import { z } from "zod"
import type { ProfileIdentity } from "./profiles"

// one pending invite to a topic or a team, as its sender sees it
export const invite = z.object({
	id: z.string(),
	email: z.string().nullable(),
	// what an invite url includes. the ui builds the url from it against its own origin
	token: z.string(),
	maxUses: z.number(),
	usedCount: z.number(),
	expiresAt: z.string().nullable(),
})

export type Invite = z.infer<typeof invite>

// which control created an invite
export const inviteSources = ["compose", "copy-link", "share-sheet"] as const

export type InviteSource = (typeof inviteSources)[number]

// what creating an invite returns: the invite whose url goes into a composer or onto the clipboard
export const inviteCreateResponse = z.object({ invite })

// the ways an invite join token can fail, each one its own reason
export const inviteRejections = ["expired", "exhausted", "unknown"] as const

export type InviteRejection = (typeof inviteRejections)[number]

// what accepting an invite returns: the topic to open, or which way the token failed
export const inviteAcceptResponse = z.discriminatedUnion("status", [
	z.object({ status: z.literal("joined"), topicId: z.string(), topicName: z.string() }),
	z.object({ status: z.literal("joinedTeam"), teamId: z.string(), teamName: z.string() }),
	z.object({ status: z.literal("requestedTeam"), teamId: z.string(), teamName: z.string() }),
	z.object({ status: z.literal("teamFull"), teamId: z.string(), teamName: z.string() }),
	z.object({ status: z.enum(inviteRejections) }),
])

export type InviteAcceptResponse = z.infer<typeof inviteAcceptResponse>

// a topic invitation waiting for the user's answer, as the badges name it
export type TopicInviteBadge = { inviteId: string; topicId: string; topicName: string; inviterUsername: string }

// an invite the user sent on a topic they own
export type InviteRow = {
	inviteId: string
	topicId: string
	name: string
	// the address the sender used, null on a username invite that renders its username instead
	inviteeEmail: string | null
	// the invitee's account when the invite resolved to one, for the avatar and profile link
	invitee: ProfileIdentity | null
	invitedAt: string
	subscribedAt: string | null
}
