// the invites that name a person, by email or by @username
import { zValidator } from "@hono/zod-validator"
import type { Invite, UserInvitePayload } from "@shared/contracts"
import { type ProfileIdentity, userInvitePayload } from "@shared/contracts"
import { toNormalizedUsername } from "@shared/usernames"
import { and, eq, inArray, or, sql } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { db } from "../../db"
import { canCreateInvitesToday } from "../../db/quotas"
import { invites, topics, users } from "../../db/schema"
import { isAllowed } from "../authorization"
import { isConnected } from "../connections"
import { type AppEnv, currentUser } from "../currentUser"
import { toTeamRole } from "../team/members"
import { startUserInviteEmail } from "./emails"
import { acceptTeamInvite, acceptTopicInvite, type InviteAcceptResult, toInvite, toInviteRejection } from "./invites"

// the target an invite opens and the ways a user-invite creation is rejected
export type InviteTarget = { topicId: string } | { teamId: string }
export type UserInviteRejection = "forbidden" | "unknown-username" | "not-accepting" | "limited"

// the resolved recipient of a user invite: the account and its invite-access setting
type InviteRecipient = { id: string; email: string; inviteAccess: (typeof users.$inferSelect)["inviteAccess"] }

/**
 * Create an invite that names a person, by username or by email, for a topic or a team.
 * Resolution, the recipient's invite-access setting, and the computed limit are all checked before anything is written.
 */
export async function createUserInvite(
	senderUserId: string,
	inviteTarget: InviteTarget,
	address: UserInvitePayload,
): Promise<Invite | UserInviteRejection> {
	// the sender's permission to invite to the target
	if (!(await canInviteToTarget(senderUserId, inviteTarget))) {
		return "forbidden"
	}

	// the invite recipient: required for a username, optional for an address nobody holds yet
	const inviteRecipient = await resolveInviteRecipient(address)
	if (address.username !== undefined && !inviteRecipient) {
		return "unknown-username"
	}

	// the recipient's invite-access setting and the sender's connection to them, read once and used twice
	const isConnectedRecipient = inviteRecipient ? await isConnected(senderUserId, inviteRecipient.id) : false
	if (inviteRecipient && isInviteRejected(inviteRecipient.inviteAccess, isConnectedRecipient)) {
		return "not-accepting"
	}

	// only an email invite draws from the daily limit
	if (address.email && !(await canCreateInvitesToday(senderUserId, 1, isConnectedRecipient))) {
		return "limited"
	}

	// save the invite: a pending invite is a no-op, a declined one reopens, a new one inserts
	const inviteRecipientEmail = address.email ?? null
	const inviteStatus = await upsertUserInvite(inviteTarget, senderUserId, {
		recipientUserId: inviteRecipient?.id ?? null,
		email: inviteRecipientEmail,
		matchEmail: inviteRecipientEmail ?? inviteRecipient?.email ?? null,
	})
	if (inviteStatus === "forbidden") {
		return "forbidden"
	}

	// only the email path sends mail, and only when the save created or reopened an invite row
	if (inviteRecipientEmail && inviteStatus.isCreated) {
		startUserInviteEmail(inviteTarget, senderUserId, inviteRecipientEmail, inviteStatus.invite.token)
	}
	return inviteStatus.invite
}

// write the user's invite row: an existing pending invite is a no-op
async function upsertUserInvite(
	target: InviteTarget,
	senderUserId: string,
	recipientIdentity: { recipientUserId: string | null; email: string | null; matchEmail: string | null },
): Promise<{ invite: Invite; isCreated: boolean } | "forbidden"> {
	// check for the person's pending invite to this target by email or user id
	const pendingInvite = await findUserInvite(target, recipientIdentity.recipientUserId, recipientIdentity.matchEmail)
	if (pendingInvite && !pendingInvite.declinedAt) {
		return { invite: toInvite(pendingInvite), isCreated: false }
	}
	if (pendingInvite) {
		const reopened = await reopenInvite(pendingInvite.id, senderUserId)
		return reopened === "forbidden" ? "forbidden" : { invite: reopened, isCreated: true }
	}

	// the invite row, one use, storing the email address if any, and the resolved user id if any
	const [invite] = await db
		.insert(invites)
		.values({
			...target,
			email: recipientIdentity.email,
			invitedUserId: recipientIdentity.recipientUserId,
			invitedByUserId: senderUserId,
		})
		.onConflictDoNothing()
		.returning()
	if (invite) {
		return { invite: toInvite(invite), isCreated: true }
	}

	// the race condition backstop: a concurrent creation already wrote this person's row, which is the same no-op
	const existingInvite = await findUserInvite(target, recipientIdentity.recipientUserId, recipientIdentity.matchEmail)
	return existingInvite ? { invite: toInvite(existingInvite), isCreated: false } : "forbidden"
}

// whether the sender may invite to this target: edit authority on the topic, membership on the team
async function canInviteToTarget(senderUserId: string, target: InviteTarget): Promise<boolean> {
	if ("teamId" in target) {
		return (await toTeamRole(senderUserId, target.teamId)) !== null
	}

	// the topic path mirrors the link-invite authority
	const [topic] = await db.select().from(topics).where(eq(topics.id, target.topicId))
	return Boolean(topic && (await isAllowed(senderUserId, "topic:edit", topic)))
}

// the account an email address names, or null if nobody has it yet
async function resolveInviteRecipient(address: UserInvitePayload): Promise<InviteRecipient | null> {
	if (address.email !== undefined) {
		const [byEmail] = await db
			.select({ id: users.id, email: users.email, inviteAccess: users.inviteAccess })
			.from(users)
			.where(eq(users.email, address.email))
		return byEmail ?? null
	}

	// the username's normalized form finds the user, no matter how the sender spelled it
	const [byUsername] = await db
		.select({ id: users.id, email: users.email, inviteAccess: users.inviteAccess })
		.from(users)
		.where(eq(users.usernameNormalized, toNormalizedUsername(address.username ?? "")))
	return byUsername ?? null
}

// whether the recipient's invite-access setting rejects this sender: nobody rejects everyone, connected access rejects strangers
export function isInviteRejected(inviteAccess: InviteRecipient["inviteAccess"], isConnectedSender: boolean): boolean {
	if (inviteAccess === "nobody") {
		return true
	}
	return inviteAccess === "connected" && !isConnectedSender
}

// the target's existing row for this user, matched by user id or by address so modes share one slot
async function findUserInvite(
	target: InviteTarget,
	recipientUserId: string | null,
	email: string | null,
): Promise<typeof invites.$inferSelect | undefined> {
	// with nobody to match there is nothing to find
	if (!recipientUserId && !email) {
		return undefined
	}
	const targetFilter = "topicId" in target ? eq(invites.topicId, target.topicId) : eq(invites.teamId, target.teamId)
	// either email or username reaches the row, so a resolved email invite and a username invite share one slot
	const [existingInvite] = await db
		.select()
		.from(invites)
		.where(
			// an absent identifier matches nothing instead of everything
			and(
				targetFilter,
				or(
					recipientUserId ? eq(invites.invitedUserId, recipientUserId) : sql`false`,
					email ? eq(invites.email, email) : sql`false`,
				),
			),
		)
		.limit(1)
	return existingInvite
}

// a declined invite row reopens on an explicit re-invite
async function reopenInvite(inviteId: string, senderUserId: string): Promise<Invite | "forbidden"> {
	const [reopenedInvite] = await db
		.update(invites)
		.set({ declinedAt: null, invitedAt: new Date(), invitedByUserId: senderUserId })
		.where(eq(invites.id, inviteId))
		.returning()
	return reopenedInvite ? toInvite(reopenedInvite) : "forbidden"
}

// what checking a topic save's invitee list found, before the save writes anything
export type InviteeCheck =
	| { status: "ok"; invitedUserIdByEmail: Map<string, string | null>; newInvites: string[]; reinvitedEmails: string[] }
	| { status: "inviteeRejected"; email: string }
	| { status: "inviteLimit" }

/**
 * Checks a topic save's invitee list: each address against its account, each new recipient against their
 * invite-access setting, and the whole batch against the sender's computed limit.
 */
export async function checkTopicInvitees(
	senderUserId: string,
	topicId: string | null,
	inviteEmails: string[],
): Promise<InviteeCheck> {
	// the rows the topic already holds decide which invites are new and which re-invite a declined one
	const existingInviteRows = topicId
		? await db
				.select({ email: invites.email, declinedAt: invites.declinedAt })
				.from(invites)
				.where(and(eq(invites.topicId, topicId), inArray(invites.email, inviteEmails.length > 0 ? inviteEmails : [""])))
		: []
	// three buckets: pending, declined and re-invited, and new
	const pendingEmails = new Set(
		existingInviteRows.filter((inviteRow) => !inviteRow.declinedAt).map((inviteRow) => inviteRow.email),
	)
	const declinedEmails = new Set(
		existingInviteRows.filter((inviteRow) => inviteRow.declinedAt).map((inviteRow) => inviteRow.email),
	)
	const newInvites = inviteEmails.filter((email) => !pendingEmails.has(email) && !declinedEmails.has(email))
	const reinvitedEmails = inviteEmails.filter((email) => declinedEmails.has(email))

	// each newly invited or re-invited recipient's invite-access setting is checked, and every address resolves for the save
	const invitedUserIdByEmail = new Map<string, string | null>()
	for (const email of inviteEmails) {
		const inviteRecipient = await resolveInviteRecipient({ email })
		invitedUserIdByEmail.set(email, inviteRecipient?.id ?? null)
		// only a newly invited or re-invited recipient's setting gates
		const isNewlyInvited = !pendingEmails.has(email)
		if (isNewlyInvited && inviteRecipient) {
			const isConnectedRecipient = await isConnected(senderUserId, inviteRecipient.id)
			if (isInviteRejected(inviteRecipient.inviteAccess, isConnectedRecipient)) {
				return { status: "inviteeRejected", email }
			}
		}
	}

	// the whole batch of new and re-invited invitations draws from the computed limit at once
	const createInviteCount = newInvites.length + reinvitedEmails.length
	if (createInviteCount > 0 && !(await canCreateInvitesToday(senderUserId, createInviteCount))) {
		return { status: "inviteLimit" }
	}
	return { status: "ok", invitedUserIdByEmail, newInvites, reinvitedEmails }
}

// the invitee's account when the invite resolved to one, otherwise null
export function toInvitee(inviteRow: {
	inviteeUserId: string | null
	inviteeUsername: string | null
	inviteeAvatarSource: string | null
}): ProfileIdentity | null {
	return inviteRow.inviteeUserId && inviteRow.inviteeUsername
		? {
				userId: inviteRow.inviteeUserId,
				username: inviteRow.inviteeUsername,
				avatarSource: inviteRow.inviteeAvatarSource,
			}
		: null
}

/**
 * Whether this user is the invitation's recipient: an address they verified, or the account a username resolved to.
 * Signing up no longer proves the address, so an invitation sent to one accepts only a verified match.
 */
export function isInviteRecipient(
	invite: Pick<typeof invites.$inferSelect, "invitedUserId" | "email">,
	user: { id: string; email: string; isEmailVerified: boolean },
): boolean {
	// the address the invitation was sent to is the check, even if it resolved to an account when it was sent
	if (invite.email !== null) {
		return user.isEmailVerified && invite.email === user.email
	}

	// a username invitation names an account outright, so there is no address to prove
	return invite.invitedUserId === user.id
}

// the invitation row when the user is its recipient and not yet declined, otherwise null
async function loadReceivedInvite(userId: string, inviteId: string): Promise<typeof invites.$inferSelect | null> {
	// the row, the user's address, and the recipient check together
	const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId))
	const [user] = await db
		.select({ email: users.email, isEmailVerified: users.emailVerified })
		.from(users)
		.where(eq(users.id, userId))
	if (!invite || !user || !isInviteRecipient(invite, { id: userId, ...user })) {
		return null
	}

	// a declined invitation left both pages, so it can no longer be used
	return invite.declinedAt ? null : invite
}

/**
 * Accept an invitation from the page it renders on: exactly what accepting its token does,
 * for either target and either mode, rejected the same ways a token is.
 */
export async function acceptInvite(userId: string, inviteId: string): Promise<InviteAcceptResult> {
	const invite = await loadReceivedInvite(userId, inviteId)
	if (!invite) {
		return { status: "unknown" }
	}

	// revocation and expiry answer identically for email and username invites, exactly as the token path does
	const rejection = toInviteRejection(invite, new Date())
	if (rejection) {
		return { status: rejection }
	}
	return invite.teamId ? acceptTeamInvite(userId, invite) : acceptTopicInvite(userId, invite)
}

/**
 * Decline an invitation: update the row so the reputation check can read it.
 */
export async function declineInvite(userId: string, inviteId: string): Promise<boolean> {
	const invite = await loadReceivedInvite(userId, inviteId)
	if (!invite) {
		return false
	}

	// save the declined at time to update the sender's reputation
	await db.update(invites).set({ declinedAt: new Date() }).where(eq(invites.id, invite.id))
	return true
}

// answer a user-invite creation: the invite, or its rejection on the status the target calls for
function respondUserInvite(
	context: Context<AppEnv>,
	inviteResult: Invite | UserInviteRejection,
	forbiddenStatus: 403 | 404,
): Response {
	// each rejection keeps its name, so the api client can tell an unknown username from a recipient who is not accepting
	if (inviteResult === "forbidden") {
		return context.json({ error: "forbidden" }, forbiddenStatus)
	}
	if (inviteResult === "unknown-username") {
		return context.json({ error: "unknown-username" }, 422)
	}
	// the recipient's setting and the sender's limit each answer with their own reason
	if (inviteResult === "not-accepting") {
		return context.json({ error: "not-accepting" }, 403)
	}
	if (inviteResult === "limited") {
		return context.json({ error: "daily invite limit reached" }, 429)
	}
	// past every rejection, the invite itself is the response
	return context.json({ invite: inviteResult })
}

// the user-invite routes: creating an invite for a topic or a team, and responding to an invite received
export const userInvitesRoute = new Hono<AppEnv>()
	.post("/topics/:id/invites/user", zValidator("json", userInvitePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create the user invite, each rejection returning its own status
		const invite = await createUserInvite(userId, { topicId: context.req.param("id") }, context.req.valid("json"))
		return respondUserInvite(context, invite, 403)
	})
	.post("/teams/:id/invites/user", zValidator("json", userInvitePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create the user invite. a private team is not shown to non-members, so its forbidden status returns not found
		const invite = await createUserInvite(userId, { teamId: context.req.param("id") }, context.req.valid("json"))
		return respondUserInvite(context, invite, 404)
	})
	.post("/invites/:id/accept", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the page gets the same answer shape the join page does
		return context.json(await acceptInvite(userId, context.req.param("id")))
	})
	.post("/invites/:id/decline", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the decline updates the row to check the sender's reputation
		const isDeclined = await declineInvite(userId, context.req.param("id"))
		return isDeclined ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
