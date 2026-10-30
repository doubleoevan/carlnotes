// the invite contracts: an invite as its sender sees it, its sources and rejections, and its responses
import { z } from "zod"
import { profileIdentity } from "./profiles"

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

// what an invite page shows as a rejection: a failed token, or a team with no room left
export type InviteNoticeRejection = InviteRejection | "teamFull"

// the characters an invite token holds. a token is a uuid, and the alphabet keeps a slash or a dot out of the api path
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Returns true if a token from a link has the shape of an invite token, so a crafted link never names another route.
 */
export function isInviteToken(token: string): boolean {
	return INVITE_TOKEN_PATTERN.test(token)
}

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
export const topicInviteBadge = z.object({
	inviteId: z.string(),
	topicId: z.string(),
	topicName: z.string(),
	inviterUsername: z.string(),
})

export type TopicInviteBadge = z.infer<typeof topicInviteBadge>

// an invite the user sent on a topic they own
export const inviteRow = z.object({
	inviteId: z.string(),
	topicId: z.string(),
	name: z.string(),
	// the address the sender used, null on a username invite that renders its username instead
	inviteeEmail: z.string().nullable(),
	// the invitee's account when the invite resolved to one, for the avatar and profile link
	invitee: profileIdentity.nullable(),
	invitedAt: z.string(),
	subscribedAt: z.string().nullable(),
})

export type InviteRow = z.infer<typeof inviteRow>
