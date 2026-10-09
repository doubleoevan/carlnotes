// the invitations a user received: the recipient check, the pending ones, and accepting or declining one from the
// page it renders on
import { trackEvent } from "@shared/analytics"
import type { TopicInviteBadge } from "@shared/contracts"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { invites, users } from "../../db/schema"
import { loadInvitedTopicSubscriptions } from "../activity"
import { type AnalyticsProperties, type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import {
	acceptTeamInvite,
	acceptTopicInvite,
	type InviteAcceptResult,
	toInviteProperties,
	toInviteRejection,
} from "./invites"

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
	// read the row and the user's address, then run the recipient check
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
export async function acceptInvite(
	userId: string,
	inviteId: string,
	analyticsProperties?: AnalyticsProperties,
): Promise<InviteAcceptResult> {
	const invite = await loadReceivedInvite(userId, inviteId)
	if (!invite) {
		return { status: "unknown" }
	}

	// revocation and expiry answer identically for email and username invites, exactly as the token path does
	const inviteRejection = toInviteRejection(invite, new Date())
	if (inviteRejection) {
		return { status: inviteRejection }
	}
	return invite.teamId
		? acceptTeamInvite(userId, invite, analyticsProperties)
		: acceptTopicInvite(userId, invite, analyticsProperties)
}

/**
 * Decline an invitation: update the row so the reputation check can read it.
 */
export async function declineInvite(
	userId: string,
	inviteId: string,
	analyticsProperties?: AnalyticsProperties,
): Promise<boolean> {
	const invite = await loadReceivedInvite(userId, inviteId)
	if (!invite) {
		return false
	}

	// save the declined at time to update the sender's reputation, and report the decline
	await db.update(invites).set({ declinedAt: new Date() }).where(eq(invites.id, invite.id))
	trackEvent("invite_declined", userId, { ...analyticsProperties, ...toInviteProperties(invite) })
	return true
}

// the received-invite routes: the topic invitations waiting for the user, and accepting or declining one
export const receivedInvitesRoute = new Hono<AppEnv>()
	// the topic invitations waiting for this user's answer
	.get("/invites/topics/pending", async (context) => {
		const user = context.get("user")
		if (!user) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const invitedRows = await loadInvitedTopicSubscriptions({ id: user.id, email: user.email })
		// shape each row as a badge
		const topicInviteBadges: TopicInviteBadge[] = invitedRows.flatMap((invitedRow) =>
			invitedRow.inviteId
				? [
						{
							inviteId: invitedRow.inviteId,
							topicId: invitedRow.topicId,
							topicName: invitedRow.name,
							inviterUsername: invitedRow.owner.username,
						},
					]
				: [],
		)
		return context.json(topicInviteBadges)
	})
	.post("/invites/:id/accept", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the page gets the same answer shape the join page does
		return context.json(await acceptInvite(userId, context.req.param("id"), toAnalyticsProperties(context)))
	})
	.post("/invites/:id/decline", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the decline updates the row to check the sender's reputation
		const isInviteDeclined = await declineInvite(userId, context.req.param("id"), toAnalyticsProperties(context))
		return isInviteDeclined ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
