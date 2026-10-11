// the helpers for the topic page's reads: the gate, the scan history, the owner, team, and invite fields, and the
// subscription dates that gate an invite topic's findings
import { toAvatarKeyVersion } from "@shared/avatars"
import type { Invite } from "@shared/contracts/invites"
import type { ProfileIdentity } from "@shared/contracts/profiles"
import type { TopicGateResponse, TopicResponse, TopicScan } from "@shared/contracts/topics"
import { isDailyFrequency } from "@shared/enums"
import { and, eq, inArray, or, sql } from "drizzle-orm"
import { db } from "../../db"
import { dailyScanLimit, dailyTopicIdsWithinLimit } from "../../db/quotas"
import { teamMembers, teams, teamTopics } from "../../db/schema/teams"
import { topics } from "../../db/schema/topics"
import { users } from "../../db/schema/users"
import { isAllowed, isMonthlySpendExhausted, loadUserAccess, memberTopicIds } from "../authorization"
import { withAvatarVersion } from "../avatars"
import { loadPendingTopicInvites } from "../invite/invites"
import { loadFeaturedTopics } from "./featuring"
import { subscriptionActivatedAt, subscriptionActivatedAtByTopicId, toTopicRole } from "./permissions"
import { scansRemaining } from "./quotas"

/**
 * Loads the gate response of an invite or private topic, or null for a public or missing topic.
 */
export async function loadTopicGateResponse(topicId: string): Promise<TopicGateResponse | null> {
	// load the topic's visibility and name, and build its gate
	const [topic] = await db
		.select({ visibility: topics.visibility, name: topics.name })
		.from(topics)
		.where(eq(topics.id, topicId))
	return topic ? toTopicGateResponse(topic) : null
}

/**
 * Returns the gate response of an invite or private topic, naming only an invite topic, or null for a public topic.
 */
export function toTopicGateResponse(
	topic: Pick<typeof topics.$inferSelect, "visibility" | "name">,
): TopicGateResponse | null {
	// a public topic has no gate
	if (topic.visibility === "public") {
		return null
	}
	return {
		error: "forbidden",
		gatedVisibility: topic.visibility,
		topicName: topic.visibility === "invite" ? topic.name : null,
	}
}

// the latest succeeded topic scan with its recap and duration
export function toLastTopicScanFields(
	scanHistory: TopicScan[],
	scanRows: { id: string; scanSummary: string | null }[],
): { lastSucceededTopicScan: TopicScan | null; scanSummary: string | null; lastScanDurationMs: number | null } {
	// without a succeeded topic scan, there is nothing to read
	const lastSucceededTopicScan = toLastSucceededTopicScan(scanHistory)
	if (!lastSucceededTopicScan) {
		return { lastSucceededTopicScan: null, scanSummary: null, lastScanDurationMs: null }
	}

	// the topic's last succeeded scanSummary, read from the scan rows already in memory
	const scanSummary = scanRows.find((scanRow) => scanRow.id === lastSucceededTopicScan.id)?.scanSummary ?? null
	// how long that scan took, from its start and finish times
	const lastScanDurationMs =
		lastSucceededTopicScan.finishedAt !== null
			? new Date(lastSucceededTopicScan.finishedAt).getTime() - new Date(lastSucceededTopicScan.startedAt).getTime()
			: null
	return { lastSucceededTopicScan, scanSummary, lastScanDurationMs }
}

// the scan rows in the topic response's shape, stopped scans left out and the cost shown only with spend access
export function toScanHistory(
	// the raw scan columns, as the page query selects them
	scanRows: {
		id: string
		status: TopicScan["status"]
		startedAt: Date
		finishedAt: Date | null
		stoppedAt: Date | null
		// the counts, and the cost nulled without spend access
		foundCount: number
		keptCount: number
		filteredCount: number
		cost: string
		error: string | null
	}[],
	canSeeSpend: boolean,
): TopicScan[] {
	return scanRows
		.filter((scan) => scan.stoppedAt === null)
		.map((scan) => ({
			id: scan.id,
			status: scan.status,
			// the run times as iso strings, which is what the JSON has
			startedAt: scan.startedAt.toISOString(),
			finishedAt: scan.finishedAt?.toISOString() ?? null,
			stoppedAt: scan.stoppedAt?.toISOString() ?? null,
			// the counts, and the cost in dollars where spend is visible
			foundCount: scan.foundCount,
			keptCount: scan.keptCount,
			filteredCount: scan.filteredCount,
			costDollars: canSeeSpend ? Number(scan.cost) : null,
			error: scan.error,
			podcastEpisode: null,
		}))
}

// the owner fields that the topic page reads
export async function toInviteAndScanFields(
	userId: string | null,
	topic: typeof topics.$inferSelect,
	isTopicOwner: boolean,
): Promise<{
	inviteRows: Invite[]
	manualScansRemaining: number | null
	manualScanLimit: number | null
	isSpendExhausted: boolean
}> {
	// the invite list is the owner's alone, and the quota belongs to whoever may scan
	const inviteRows = isTopicOwner ? await loadPendingTopicInvites(topic.id) : []
	const canScan = await isAllowed(userId, "scan:request", topic)
	return {
		inviteRows,
		manualScansRemaining: userId ? await scansRemaining(userId, canScan) : null,
		manualScanLimit: userId && canScan ? await dailyScanLimit(userId) : null,
		// only someone who may scan needs their spend checked
		isSpendExhausted: userId && canScan ? await isMonthlySpendExhausted(userId) : false,
	}
}

/**
 * Loads the topic owner's public identity, or null if the owner's row is gone.
 */
export async function loadTopicOwner(ownerId: string): Promise<ProfileIdentity | null> {
	const [ownerRow] = await db
		.select({
			userId: users.id,
			username: users.username,
			avatarSource: users.avatarSource,
			avatarKey: users.avatarKey,
		})
		.from(users)
		.where(eq(users.id, ownerId))
	return ownerRow ? withAvatarVersion(ownerRow) : null
}

// the team fields for the team page includes the owning team, the user's membership and rooms, how many teams
export async function toTeamFields(
	topicId: string,
	teamId: string | null,
	userId: string | null,
): Promise<
	Pick<TopicResponse, "team" | "isTeamMember" | "roomTeams" | "teamCount" | "hasRequestedToJoin"> & {
		teamLink: TopicResponse["teamLink"]
	}
> {
	// the owning team's own row, the source of both the badge fields and the byline
	const [teamRow] = teamId
		? await db
				.select({ name: teams.name, isPublic: teams.isPublic, avatarKey: teams.avatarKey })
				.from(teams)
				.where(eq(teams.id, teamId))
		: []
	const team = teamId && teamRow ? { teamId, name: teamRow.name, isPublic: teamRow.isPublic } : null

	// the byline's link to the owning team, which only a credited team gets
	const isPublicTeam = teamRow?.isPublic === true
	const toTeamLink = (isCredited: boolean): TopicResponse["teamLink"] =>
		isCredited && teamId && teamRow
			? { teamId, name: teamRow.name, avatarVersion: toAvatarKeyVersion(teamRow.avatarKey) }
			: null

	// the teams that have this topic: the owning team in the topic's own column, and one shared row for each
	const sharedTeamRows = await db
		.select({ teamId: teamTopics.teamId })
		.from(teamTopics)
		.where(eq(teamTopics.topicId, topicId))
	const teamCount = sharedTeamRows.length + (teamId ? 1 : 0)

	// the user's status for this team
	if (!userId) {
		return {
			team,
			isTeamMember: false,
			teamLink: toTeamLink(isPublicTeam),
			roomTeams: [],
			teamCount,
			hasRequestedToJoin: false,
		}
	}

	// a membership on any of the shared teams counts as membership
	const isTeamMember = [
		inArray(
			teamMembers.teamId,
			sharedTeamRows.map((sharedTeamRow) => sharedTeamRow.teamId),
		),
	]
	if (teamId) {
		isTeamMember.push(eq(teamMembers.teamId, teamId))
	}

	// this user's membership rows across teams, in name order. an "asked to join" team is a request waiting on a leader
	const topicTeamMemberRows = await db
		.select({ teamId: teams.id, name: teams.name, isActive: teamMembers.isActive })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(and(eq(teamMembers.userId, userId), or(...isTeamMember)))
		.orderBy(sql`lower(${teams.name})`)

	// an active team member row allows access to that team's chat room
	const chatRoomTeamRows = topicTeamMemberRows
		.filter((teamMemberRow) => teamMemberRow.isActive)
		.map((teamMemberRow) => ({ teamId: teamMemberRow.teamId, name: teamMemberRow.name }))
	const hasRequestedToJoin = topicTeamMemberRows.some((memberRow) => !memberRow.isActive && memberRow.teamId === teamId)

	// the owning team's own membership is what credits a private team's link
	const isOwningMember = teamId !== null && chatRoomTeamRows.some((roomTeamRow) => roomTeamRow.teamId === teamId)
	return {
		team,
		isTeamMember: chatRoomTeamRows.length > 0,
		teamLink: toTeamLink(isPublicTeam || isOwningMember),
		roomTeams: chatRoomTeamRows,
		teamCount,
		hasRequestedToJoin,
	}
}

// the invite-topic findings subscription start date for this user
export async function topicSubscriptionStartDate(
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility" | "teamId">,
	userId: string | null,
	isAdmin: boolean,
): Promise<Date | null | undefined> {
	// only an invite topic gates findings, never for an admin, and never for an effective role
	if (topic.visibility !== "invite" || isAdmin || (await toTopicRole(userId, topic)) !== null) {
		return undefined
	}
	// a signed-out user holds no subscription to activate
	return userId ? subscriptionActivatedAt(userId, topic.id) : null
}

/**
 * Returns topicSubscriptionStartDate for many topics in a fixed number of queries, by topic id.
 * A topic that gates nothing for the user has no entry.
 */
export async function topicSubscriptionStartDates(
	topicRows: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility">[],
	userId: string | null,
): Promise<Map<string, Date | null>> {
	// only an invite topic gates findings, and a signed-out user holds no subscription to activate
	const inviteTopicRows = topicRows.filter((topicRow) => topicRow.visibility === "invite")
	if (inviteTopicRows.length === 0 || !userId) {
		return new Map(inviteTopicRows.map((topicRow) => [topicRow.id, null]))
	}

	// whether the user is an admin, the topics a team of the user holds, and when each subscription activated
	const inviteTopicIds = inviteTopicRows.map((topicRow) => topicRow.id)
	const [{ isAdmin }, memberTopicIdSet, activatedAtByTopicId] = await Promise.all([
		loadUserAccess(userId),
		memberTopicIds(userId, inviteTopicIds),
		subscriptionActivatedAtByTopicId(userId, inviteTopicIds),
	])

	// an admin and an effective role are never gated. the owner and a holding team's member each have an effective role
	const gatedTopicRows = isAdmin
		? []
		: inviteTopicRows.filter((topicRow) => topicRow.ownerId !== userId && !memberTopicIdSet.has(topicRow.id))
	return new Map(gatedTopicRows.map((topicRow) => [topicRow.id, activatedAtByTopicId.get(topicRow.id) ?? null]))
}

/**
 * The most recent succeeded scan in a newest-first history. A later failed scan does not replace the last successful result.
 */
export function toLastSucceededTopicScan(scanHistory: TopicScan[]): TopicScan | undefined {
	return scanHistory.find((topicScan) => topicScan.status === "succeeded")
}

/**
 * Whether the owner holds more daily topics than their plan allows, leaving this topic's frequency skipped and unscanned.
 */
export async function toDailyFrequencyPaused(
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "frequency">,
	isTopicOwner: boolean,
): Promise<boolean> {
	if (!isTopicOwner || !isDailyFrequency(topic.frequency)) {
		return false
	}
	return !(await dailyTopicIdsWithinLimit(topic.ownerId)).has(topic.id)
}

/**
 * The scheduled time with its seconds dropped, which drizzle's time column always returns ("09:00:00" to "09:00").
 */
export function toScheduledTimeLabel(scheduledTime: string): string {
	return scheduledTime.slice(0, 5)
}

/**
 * Where this topic sits in the Featured section, and the section itself for the Rank menu to show.
 * Only an admin can see it.
 */
export async function toFeaturedTopics(
	featureOrder: number | null,
	isAdmin: boolean,
): Promise<Pick<TopicResponse, "featureOrder" | "featuredTopics">> {
	if (!isAdmin) {
		return { featureOrder: null, featuredTopics: null }
	}
	return { featureOrder, featuredTopics: await loadFeaturedTopics() }
}
