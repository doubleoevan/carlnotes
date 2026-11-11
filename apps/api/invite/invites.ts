// the invite links: creating a topic or team link, the target a token opens, a topic's pending invites, and the
// link routes

import type { Invite, InviteSource } from "@carlnotes/contracts/invites"
import { inviteCreatePayload } from "@carlnotes/contracts/payloads"
import { PLANS } from "@carlnotes/contracts/plans"
import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { canCreateInvitesToday } from "@carlnotes/db/inviteLimits"
import { assertPersonalSourcesConverted, lockPersonalSourcesTopic } from "@carlnotes/db/personalSourcesLocks"
import { loadUserAccess } from "@carlnotes/db/quotas"
import { invites } from "@carlnotes/db/schema/invites"
import { topics } from "@carlnotes/db/schema/topics"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq, isNull, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toTeamRole } from "../team/members"
import { loadTopicPostRow } from "../topicPost/topicPosts"
import { acceptInviteToken, toTokenRejection } from "./inviteAcceptance"

// how long an invite link works for. an email invite gets one use and never expires
const LINK_INVITE_DAYS = 30

/**
 * Create an invite link for a topic, naming nobody. Whoever holds its token may accept it until its uses run out
 * or its expiry passes. A link shared from a Topic Post names the post, which it opens once it is accepted.
 */
export async function createTopicInvite(
	userId: string,
	topicId: string,
	source: InviteSource,
	analyticsProperties: AnalyticsProperties,
	topicPostId: string | null = null,
): Promise<Invite | "forbidden" | "limited" | "unknown-topic-post"> {
	// only someone who may edit the topic may invite to it, which is its owner or an admin
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:edit", topic)) || !(await isAllowed(userId, "topic:invite", topic))) {
		return "forbidden"
	}

	// a link names only a published Topic Post of this topic
	if (topicPostId && !(await isPublishedTopicPostOfTopic(topicPostId, topicId))) {
		return "unknown-topic-post"
	}

	// reuse the caller's live link for this topic, or for this Topic Post, instead of writing a second row
	const liveLinkInvite = await toLiveLinkInvite(userId, { topicId, topicPostId })
	if (liveLinkInvite) {
		trackEvent("invite_reused", userId, { ...analyticsProperties, topicId, source })
		return toInvite(liveLinkInvite)
	}

	// the per-account daily limit, checked before anything is written
	if (!(await canCreateInvitesToday(userId))) {
		return "limited"
	}

	// the link names no address, so it has a use limit and an expiry instead
	const expiresAt = new Date(Date.now() + LINK_INVITE_DAYS * DAY_MS)
	const invite = await db.transaction(async (transaction) => {
		// serialize invitation creation with private confirmation
		await lockPersonalSourcesTopic(transaction, topicId)
		await assertPersonalSourcesConverted(transaction, topicId)

		// store the link
		const [invite] = await transaction
			.insert(invites)
			.values({
				topicId,
				topicPostId,
				invitedByUserId: userId,
				maxUses: await toLinkInviteMaxUses(userId),
				expiresAt,
			})
			.returning()
		return invite
	})

	// no row means nothing was created
	if (!invite) {
		return "forbidden"
	}

	// record which control created the invite
	trackEvent("invite_created", userId, { ...analyticsProperties, topicId, source })
	return toInvite(invite)
}

/**
 * Any team member's can create an invite link for a team with the same limits and lifecycle a topic link has.
 */
export async function createTeamInvite(
	userId: string,
	teamId: string,
	source: InviteSource,
	analyticsProperties: AnalyticsProperties,
): Promise<Invite | "forbidden" | "limited"> {
	// only a team member may invite to their team
	if ((await toTeamRole(userId, teamId)) === null) {
		return "forbidden"
	}

	// reuse the caller's live link for this team instead of writing a second row
	const liveLinkInvite = await toLiveLinkInvite(userId, { teamId })
	if (liveLinkInvite) {
		trackEvent("invite_reused", userId, { ...analyticsProperties, teamId, source })
		return toInvite(liveLinkInvite)
	}

	// the per-account daily limit, checked before anything is written
	if (!(await canCreateInvitesToday(userId))) {
		return "limited"
	}

	// the link names no address, so it has a use limit and an expiry instead
	const expiresAt = new Date(Date.now() + LINK_INVITE_DAYS * DAY_MS)
	const [invite] = await db
		.insert(invites)
		.values({ teamId, invitedByUserId: userId, maxUses: await toLinkInviteMaxUses(userId), expiresAt })
		.returning()

	// record which control created the invite
	trackEvent("invite_created", userId, { ...analyticsProperties, teamId, source })
	return invite ? toInvite(invite) : "forbidden"
}

// whether a Topic Post is a published post of the topic. a draft is its author's alone, so no link names one
async function isPublishedTopicPostOfTopic(topicPostId: string, topicId: string): Promise<boolean> {
	const topicPostRow = await loadTopicPostRow(topicPostId)
	return Boolean(topicPostRow?.topicPost.publishedAt && topicPostRow.topic.id === topicId)
}

// what a live token opens: a team, or a topic with the Topic Post its invite was shared from, if any
export type InviteTokenTarget = { teamId: string } | { topicId: string; topicPostId: string | null }

/**
 * Returns the topic or team a live token opens, or null when it is unknown, expired, or spent.
 */
export async function toInviteTarget(token: string): Promise<InviteTokenTarget | null> {
	const [invite] = await db.select().from(invites).where(eq(invites.token, token))
	if (!invite || (await toTokenRejection(invite))) {
		return null
	}

	// exactly one of the two is set, and the check constraint on the table is what guarantees it
	if (invite.teamId) {
		return { teamId: invite.teamId }
	}
	return invite.topicId ? { topicId: invite.topicId, topicPostId: invite.topicPostId } : null
}

/**
 * A topic's pending invites, the ones that can still be accepted, for its owner's invite list.
 */
export async function loadPendingTopicInvites(topicId: string): Promise<Invite[]> {
	// a declined, expired, or used up invite cannot be handed out, so none of them are listed
	const inviteRows = await db
		.select()
		.from(invites)
		.where(
			and(
				eq(invites.topicId, topicId),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), sql`${invites.expiresAt} > now()`),
				sql`${invites.usedCount} < ${invites.maxUses}`,
			),
		)
		.orderBy(invites.invitedAt)
	return inviteRows.map(toInvite)
}

// the caller's newest link invite for the target that can still be handed out, or null when none is live.
// scoped to the creator. a leader's team link auto-joins while a member's is a join request
async function toLiveLinkInvite(
	userId: string,
	target: { topicId: string; topicPostId: string | null } | { teamId: string },
): Promise<typeof invites.$inferSelect | null> {
	// a topic's own link and each Topic Post's link are separate rows, so one never opens what the other was shared for
	const topicPostMatch =
		"topicId" in target && target.topicPostId
			? eq(invites.topicPostId, target.topicPostId)
			: isNull(invites.topicPostId)
	const targetMatch =
		"topicId" in target ? and(eq(invites.topicId, target.topicId), topicPostMatch) : eq(invites.teamId, target.teamId)

	// the newest link of the caller's that names nobody and is still live
	const [invite] = await db
		.select()
		.from(invites)
		.where(
			and(
				targetMatch,
				eq(invites.invitedByUserId, userId),
				isNull(invites.email),
				isNull(invites.invitedUserId),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), sql`${invites.expiresAt} > now()`),
				sql`${invites.usedCount} < ${invites.maxUses}`,
			),
		)
		.orderBy(desc(invites.invitedAt))
		.limit(1)
	return invite ?? null
}

// how many people this creator's links let in, read from their plan
async function toLinkInviteMaxUses(userId: string): Promise<number> {
	const { plan } = await loadUserAccess(userId)
	return PLANS[plan].linkInviteMaxUses
}

// one invite row. the topic owner's list and the create response both show it
export function toInvite(invite: typeof invites.$inferSelect): Invite {
	return {
		id: invite.id,
		email: invite.email,
		token: invite.token,
		maxUses: invite.maxUses,
		usedCount: invite.usedCount,
		expiresAt: invite.expiresAt?.toISOString() ?? null,
	}
}

// the link routes: creating a topic's or a team's link, and accepting a join token
export const invitesRoute = new Hono<AppEnv>()
	.post("/topics/:id/invites", zValidator("json", inviteCreatePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create a link for this topic, rejected without the authority to invite or past the daily limit
		const { source, topicPostId } = context.req.valid("json")
		const invite = await createTopicInvite(
			userId,
			context.req.param("id"),
			source,
			toAnalyticsProperties(context),
			topicPostId,
		)
		// answer each rejection on its own status, so the api client can tell a limit from a forbidden reason
		if (invite === "forbidden") {
			return context.json({ error: "forbidden" }, 403)
		}
		if (invite === "unknown-topic-post") {
			return context.json({ error: "not found" }, 404)
		}

		// the daily limit, or the link
		return invite === "limited" ? context.json({ error: "daily invite limit reached" }, 429) : context.json({ invite })
	})
	.post("/teams/:id/invites", zValidator("json", inviteCreatePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create a team link, rejected without membership or past the daily limit
		const { source } = context.req.valid("json")
		const invite = await createTeamInvite(userId, context.req.param("id"), source, toAnalyticsProperties(context))
		if (invite === "forbidden") {
			return context.json({ error: "not found" }, 404)
		}
		return invite === "limited" ? context.json({ error: "daily invite limit reached" }, 429) : context.json({ invite })
	})
	.post("/invite/:token", async (context) => {
		// signup runs the app's one bot check, so a session is the whole requirement here
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json(await acceptInviteToken(userId, context.req.param("token"), toAnalyticsProperties(context)))
	})
