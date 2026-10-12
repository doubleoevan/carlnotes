// the invite smoke's fixtures: the run id, the accounts, topics, teams, and invite rows it seeds, and their cleanup
import type { Invite } from "@shared/contracts/invites"
import { DAY_MS } from "@shared/time"
import { toNormalizedUsername } from "@shared/usernames"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { invites } from "../../db/schema/invites"
import { teamMembers, teams } from "../../db/schema/teams"
import { subscriptions, topics } from "../../db/schema/topics"
import { users } from "../../db/schema/users"
import type { AnalyticsProperties } from "../currentUser"
import type { UserInviteRejection } from "./userInvites"

// one id per run, so emails, usernames, and team names don't collide with an earlier run's rows
export const runId = `invsmoke-${Date.now()}`

// every account and team created here, deleted at the end. topics and invites cascade off the accounts
export const createdUserIds: string[] = []
const createdTeamIds: string[] = []

// accounts are backdated a month by default
const BACKDATED_CREATED_AT = new Date(Date.now() - 30 * DAY_MS)

// the analytics shape createTopicInvite asks for. the entry drops the capture key, so nothing sends
export const ANALYTICS: AnalyticsProperties = {
	entryPoint: "web",
	plan: "free",
	platform: "desktop",
	browserPlatform: "other",
	isInAppBrowser: false,
}

/** The users row one label seeds, shared by the single and batch inserts. */
export function toUserValues(
	label: string,
	options: { inviteAccess?: (typeof users.$inferSelect)["inviteAccess"]; isFresh?: boolean } = {},
): typeof users.$inferInsert {
	// the run id keeps the email and username unique, and the normalized form lets invites resolve them
	const username = `${runId}-${label}`
	return {
		name: label,
		email: `${runId}-${label}@example.com`,
		username,
		usernameNormalized: toNormalizedUsername(username),
		inviteAccess: options.inviteAccess ?? "anyone",
		createdAt: options.isFresh ? new Date() : BACKDATED_CREATED_AT,
	}
}

/** Inserts one account and remembers it for cleanup. */
export async function createUser(
	label: string,
	options: { inviteAccess?: (typeof users.$inferSelect)["inviteAccess"]; isFresh?: boolean } = {},
): Promise<typeof users.$inferSelect> {
	// the row, failed loud. every section builds on its fixtures
	const [user] = await db.insert(users).values(toUserValues(label, options)).returning()
	if (!user) {
		throw new Error(`could not seed the ${label} account`)
	}
	// remembered so cleanup deletes it whichever way the run ends
	createdUserIds.push(user.id)
	return user
}

/** Inserts one topic. Deleting its owner cascades it away with its invites and subscriptions. */
export async function createTopic(ownerId: string, name: string, teamId?: string): Promise<typeof topics.$inferSelect> {
	const [topic] = await db.insert(topics).values({ ownerId, name, teamId }).returning()
	if (!topic) {
		throw new Error(`could not seed the topic ${name}`)
	}
	return topic
}

/** Inserts one team with its leader membership. Teams have no owner cascade, so their ids are kept for cleanup. */
export async function createTeam(label: string, leaderUserId: string): Promise<typeof teams.$inferSelect> {
	// the team row, named with the run id to keep team names unique
	const [team] = await db
		.insert(teams)
		.values({ name: `${runId} ${label}` })
		.returning()
	if (!team) {
		throw new Error(`could not seed the team ${label}`)
	}
	// the leader membership, and the id remembered for cleanup
	createdTeamIds.push(team.id)
	await db.insert(teamMembers).values({ teamId: team.id, userId: leaderUserId, role: "leader" })
	return team
}

/** Inserts one invite row directly, for the sections that exercise acceptance instead of creation. */
export async function insertInvite(values: typeof invites.$inferInsert): Promise<typeof invites.$inferSelect> {
	const [invite] = await db.insert(invites).values(values).returning()
	if (!invite) {
		throw new Error("could not seed an invite")
	}
	return invite
}

/** Reloads one invite row, for the assertions that read what a call saved or spent. */
export async function loadInvite(inviteId: string): Promise<typeof invites.$inferSelect> {
	const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId))
	if (!invite) {
		throw new Error(`the invite ${inviteId} disappeared mid-run`)
	}
	return invite
}

/** The user's subscription row on a topic, or undefined if none was written. */
export async function loadSubscription(
	userId: string,
	topicId: string,
): Promise<typeof subscriptions.$inferSelect | undefined> {
	const [subscription] = await db
		.select()
		.from(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
	return subscription
}

/** Narrows a creation result to the invite it should be, throwing the rejection it was instead. */
export function toCreatedInvite(created: Invite | UserInviteRejection, label: string): Invite {
	if (typeof created === "string") {
		throw new Error(`${label} answered ${created} instead of an invite`)
	}
	return created
}

/** Deletes everything this run created. Teams have no owner cascade, so they go before the accounts. */
export async function cleanup(): Promise<void> {
	// the teams first, cascading their memberships and team invites
	if (createdTeamIds.length > 0) {
		await db.delete(teams).where(inArray(teams.id, createdTeamIds))
	}
	// the accounts last, cascading their topics with every invite and subscription on them
	if (createdUserIds.length > 0) {
		await db.delete(users).where(inArray(users.id, createdUserIds))
	}
}
