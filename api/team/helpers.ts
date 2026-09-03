// the database helpers for the team api
import type { OwnerTopic, TeamPageResponse, TeamSearchResult, TeamSummary, TeamsPageResponse } from "@shared/contracts"
import { USER_SEARCH_LIMIT, USER_SEARCH_MIN_CHARS } from "@shared/contracts"
import { toNormalizedUsername } from "@shared/usernames"
import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "../../db"
import { chatTurns, invites, scans, teamMembers, teams, teamTopics, topics, users } from "../../db/schema"
import { loadTopics } from "../activity"
import { isAllowed, isLeaderRole } from "../authorization"
import { loadTeamChatMentions } from "../chat/mentions"
import { toInvitee } from "../invite/userInvites"
import { toTopicTableRows } from "../topic/helpers"
import { verifiedEmailQuery } from "../topic/permissions"
import { startOfUtcMonth } from "../topic/quotas"
import { toTeamRole } from "./members"

// the users table under a second name, so an invitation can join its sender beside its invitee
const senders = alias(users, "senders")

// the users table under a third name, so a membership can join whoever invited the user
const inviters = alias(users, "inviters")

/**
 * The teams page sections: the user's teams, the team invites waiting for an answer, and the team invites sent.
 */
export async function loadTeamsPage(userId: string): Promise<TeamsPageResponse> {
	// the team ids that the user is a member of
	const userTeamSummaries = await loadTeamSummaries(userId)
	const userTeamIds = new Set(userTeamSummaries.map((teamSummary) => teamSummary.teamId))

	// the team invites waiting for an answer
	const inviteRows = await db
		.select({
			inviteId: invites.id,
			teamId: teams.id,
			name: teams.name,
			isPublic: teams.isPublic,
			description: teams.description,
			avatarKey: teams.avatarKey,
			invitedAt: invites.invitedAt,
			// the sender's identity or null if their account has closed
			senderUserId: senders.id,
			senderUsername: senders.username,
			senderAvatarSource: senders.avatarSource,
		})
		.from(invites)
		.innerJoin(teams, eq(teams.id, invites.teamId))
		.leftJoin(senders, eq(senders.id, invites.invitedByUserId))
		.where(
			// pending means unanswered: no spent use, no decline, no revocation, no passed expiry.
			// an address matches only once the account verified it
			and(
				or(eq(invites.invitedUserId, userId), inArray(invites.email, verifiedEmailQuery(userId))),
				eq(invites.usedCount, 0),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
			),
		)
		.orderBy(desc(invites.invitedAt))

	// a team the user already belongs to does not show an invite
	const receivedInviteRows = inviteRows.filter((inviteRow) => !userTeamIds.has(inviteRow.teamId))

	// each remaining invite includes the counts and spend its table row shows, read in one pass each
	const invitedTeamIds = receivedInviteRows.map((inviteRow) => inviteRow.teamId)
	const [countsByTeamId, spendByTeamId] = await Promise.all([
		toCountsByTeamId(invitedTeamIds),
		toSpendByTeamId(invitedTeamIds),
	])
	const receivedInvites = receivedInviteRows.map((inviteRow) => ({
		inviteId: inviteRow.inviteId,
		teamId: inviteRow.teamId,
		name: inviteRow.name,
		isPublic: inviteRow.isPublic,
		hasAvatar: inviteRow.avatarKey !== null,
		description: inviteRow.description,
		memberCount: countsByTeamId.get(inviteRow.teamId)?.memberCount ?? 0,
		topicCount: countsByTeamId.get(inviteRow.teamId)?.topicCount ?? 0,
		scanSpendCents: spendByTeamId.get(inviteRow.teamId)?.scanCents ?? 0,
		chatSpendCents: spendByTeamId.get(inviteRow.teamId)?.chatCents ?? 0,
		sender:
			inviteRow.senderUserId && inviteRow.senderUsername
				? {
						userId: inviteRow.senderUserId,
						username: inviteRow.senderUsername,
						avatarSource: inviteRow.senderAvatarSource,
					}
				: null,
		invitedAt: inviteRow.invitedAt.toISOString(),
	}))

	// the user sent team invitations showing whether each invitee joined
	const sentInvites = await loadSentTeamInvites(userId)
	return { teams: userTeamSummaries, receivedInvites, sentInvites }
}

// the sent team invitations, matched by email or by account. declined rows stay stored but are hidden here
async function loadSentTeamInvites(userId: string): Promise<TeamsPageResponse["sentInvites"]> {
	// two single-column joins let each side use its own unique index, then coalesce selects the resolved account first
	const usersByEmail = alias(users, "users_by_email")
	const inviteeId = sql<string | null>`coalesce(${users.id}, ${usersByEmail.id})`
	const sentInviteRows = await db
		.select({
			inviteId: invites.id,
			teamId: teams.id,
			name: teams.name,
			teamAvatarKey: teams.avatarKey,
			inviteeEmail: invites.email,
			invitedAt: invites.invitedAt,
			// the invitee's account fields, null until the invitation names or resolves to an account
			inviteeUserId: inviteeId,
			inviteeUsername: sql<string | null>`coalesce(${users.username}, ${usersByEmail.username})`,
			inviteeAvatarSource: sql<string | null>`coalesce(${users.avatarSource}, ${usersByEmail.avatarSource})`,
			joinedAt: teamMembers.createdAt,
		})
		.from(invites)
		.innerJoin(teams, eq(teams.id, invites.teamId))
		.leftJoin(users, eq(users.id, invites.invitedUserId))
		.leftJoin(usersByEmail, eq(usersByEmail.email, invites.email))
		.leftJoin(
			teamMembers,
			and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, inviteeId), eq(teamMembers.isActive, true)),
		)
		.where(
			// only the rows that name a person: a link invitation names nobody and lives on the team page instead
			and(
				eq(invites.invitedByUserId, userId),
				or(isNotNull(invites.email), isNotNull(invites.invitedUserId)),
				isNull(invites.declinedAt),
			),
		)
		.orderBy(desc(invites.invitedAt))
	return sentInviteRows.map((inviteRow) => ({
		inviteId: inviteRow.inviteId,
		teamId: inviteRow.teamId,
		name: inviteRow.name,
		hasAvatar: inviteRow.teamAvatarKey !== null,
		inviteeEmail: inviteRow.inviteeEmail,
		invitee: toInvitee(inviteRow),
		invitedAt: inviteRow.invitedAt.toISOString(),
		joinedAt: inviteRow.joinedAt?.toISOString() ?? null,
	}))
}

// one Team Up menu row: a user's team and the profile user's status there
export type TeamUpMenuOption = {
	teamId: string
	name: string
	hasAvatar: boolean
	role: "leader" | "member"
	status: "member" | "invited" | "none"
	// an invite to the profile user, and whether the user may delete it: a leader may delete any
	inviteId: string | null
	canDeleteInvite: boolean
}

/**
 * The user's teams for a profile's Team Up menu, each with the profile user's status there:
 * an active member, invited by the user with that invitation's id, or neither.
 * The user sees only their own teams, which they could read the members of anyway.
 */
export async function loadTeamUpMenu(userId: string, profileUserId: string): Promise<TeamUpMenuOption[]> {
	// the user's active teams with their role in each
	const userTeams = await db
		.select({ teamId: teams.id, name: teams.name, avatarKey: teams.avatarKey, role: teamMembers.role })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
		.orderBy(teams.createdAt)

	// no teams means there is nothing further to look up
	const teamIds = userTeams.map((teamRow) => teamRow.teamId)
	if (teamIds.length === 0) {
		return []
	}

	// the profile user's active memberships among those teams, and the user's pending invites to them
	const [memberRows, inviteRows] = await Promise.all([
		db
			.select({ teamId: teamMembers.teamId })
			.from(teamMembers)
			.where(
				and(
					inArray(teamMembers.teamId, teamIds),
					eq(teamMembers.userId, profileUserId),
					eq(teamMembers.isActive, true),
				),
			),
		db
			.select({ teamId: invites.teamId, inviteId: invites.id, invitedByUserId: invites.invitedByUserId })
			.from(invites)
			.where(
				and(
					inArray(invites.teamId, teamIds),
					eq(invites.invitedUserId, profileUserId),
					eq(invites.usedCount, 0),
					isNull(invites.declinedAt),
					or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
				),
			),
	])

	// each team row names its status: a member row wins over an invited one, and neither type reads as none
	const membersByTeamId = new Set(memberRows.map((memberRow) => memberRow.teamId))
	const invitesByTeamId = new Map(inviteRows.map((inviteRow) => [inviteRow.teamId, inviteRow]))
	return userTeams.map((teamRow) => {
		const invite = invitesByTeamId.get(teamRow.teamId)
		return {
			teamId: teamRow.teamId,
			name: teamRow.name,
			hasAvatar: teamRow.avatarKey !== null,
			role: teamRow.role,
			status: membersByTeamId.has(teamRow.teamId)
				? ("member" as const)
				: invite
					? ("invited" as const)
					: ("none" as const),
			inviteId: invite?.inviteId ?? null,
			canDeleteInvite: Boolean(invite && (isLeaderRole(teamRow.role) || invite.invitedByUserId === userId)),
		}
	})
}

// the name a private team shows an outsider on its page, or null if no team has that id
export async function toGatedTeam(
	userId: string | null,
	teamId: string,
): Promise<{ name: string; hasRequestedToJoin: boolean } | null> {
	const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId))
	if (!team) {
		return null
	}

	// the user's pending request
	const [joinRequest] = userId
		? await db
				.select({ userId: teamMembers.userId })
				.from(teamMembers)
				.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.isActive, false)))
		: []
	return { name: team.name, hasRequestedToJoin: joinRequest !== undefined }
}

/**
 * One team's topics in the shape the admin page renders them. An admin sees every topic the team holds and its scan costs.
 */
export async function loadAdminTeamTopics(teamId: string): Promise<OwnerTopic[] | null> {
	const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId))
	if (!team) {
		return null
	}

	// the same rows a user's own topics table reads, so both subtables show the same columns and totals
	return loadTopics((await loadTeamTopics(teamId)).map((topicRow) => topicRow.id))
}

/**
 * Teams whose name contains the query, for the search bar's team suggestions. A public team is found
 * by anyone, and a signed-in user also finds the teams they belong to at any visibility.
 */
export async function searchTeams(query: string, userId: string | null): Promise<TeamSearchResult[]> {
	// the query must meet the same minimum length a username search has
	const username = toNormalizedUsername(query).replaceAll(/[^a-z0-9]/g, "")
	if (username.length < USER_SEARCH_MIN_CHARS) {
		return []
	}

	// the teams this user is on, which a pending request to join is not yet one of
	const memberTeamIds = userId
		? db
				.select({ teamId: teamMembers.teamId })
				.from(teamMembers)
				.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
		: null
	// a visitor finds the public teams alone, and a member finds their own beside them
	const isFindable = memberTeamIds
		? or(eq(teams.isPublic, true), inArray(teams.id, memberTeamIds))
		: eq(teams.isPublic, true)

	// shorter names sort first, where a larger portion of the name was matched
	const teamRows = await db
		.select({ teamId: teams.id, name: teams.name, avatarKey: teams.avatarKey })
		.from(teams)
		.where(and(isFindable, like(sql`lower(${teams.name})`, `%${escapeLikePattern(query.toLowerCase())}%`)))
		.orderBy(sql`length(${teams.name})`)
		.limit(USER_SEARCH_LIMIT)
	return teamRows.map((teamRow) => ({
		teamId: teamRow.teamId,
		name: teamRow.name,
		hasAvatar: teamRow.avatarKey !== null,
	}))
}

// a like pattern matches the typed characters literally, never as wildcards
function escapeLikePattern(query: string): string {
	return query.replaceAll(/[\\%_]/g, (wildcard) => `\\${wildcard}`)
}

/**
 * This month's spend in cents across each of these teams' topics, keyed by team id. A team holds no key
 * of its own, so what it costs is what its topics cost, split by what produced the spend.
 */
export async function toSpendByTeamId(
	teamIds: string[],
): Promise<Map<string, { scanCents: number; chatCents: number }>> {
	if (teamIds.length === 0) {
		return new Map()
	}

	// the scans and the chat turns on those teams' topics, each summed in one grouped query, plus the teams' own
	const monthStart = startOfUtcMonth(new Date())
	const [scanRows, chatRows, teamRoomRows] = await Promise.all([
		db
			.select({ teamId: topics.teamId, dollars: sql<string>`coalesce(sum(${scans.cost}), 0)` })
			.from(scans)
			.innerJoin(topics, eq(topics.id, scans.topicId))
			.where(and(inArray(topics.teamId, teamIds), gte(scans.startedAt, monthStart)))
			.groupBy(topics.teamId),
		db
			.select({ teamId: topics.teamId, dollars: sql<string>`coalesce(sum(${chatTurns.cost}), 0)` })
			.from(chatTurns)
			.innerJoin(topics, eq(topics.id, chatTurns.topicId))
			.where(and(inArray(topics.teamId, teamIds), gte(chatTurns.createdAt, monthStart)))
			.groupBy(topics.teamId),
		db
			.select({ teamId: chatTurns.teamId, dollars: sql<string>`coalesce(sum(${chatTurns.cost}), 0)` })
			.from(chatTurns)
			// only chat room turns count. a member's private team conversation spends on their own meter alone
			.where(
				and(
					inArray(chatTurns.teamId, teamIds),
					isNotNull(chatTurns.roomMessageId),
					gte(chatTurns.createdAt, monthStart),
				),
			)
			.groupBy(chatTurns.teamId),
	])

	// the totals combine per team in cents
	const chatCentsByTeamId = new Map(
		chatRows.map((chatRow) => [chatRow.teamId, Math.round(Number(chatRow.dollars) * 100)] as const),
	)
	for (const teamRoomRow of teamRoomRows) {
		const cents = Math.round(Number(teamRoomRow.dollars) * 100)
		chatCentsByTeamId.set(teamRoomRow.teamId, (chatCentsByTeamId.get(teamRoomRow.teamId) ?? 0) + cents)
	}
	// one spend entry per team id. zeros where nothing was spent
	const spendByTeamId = new Map<string, { scanCents: number; chatCents: number }>()
	for (const teamId of teamIds) {
		const scanRow = scanRows.find((teamScanRow) => teamScanRow.teamId === teamId)
		spendByTeamId.set(teamId, {
			scanCents: Math.round(Number(scanRow?.dollars ?? 0) * 100),
			chatCents: chatCentsByTeamId.get(teamId) ?? 0,
		})
	}
	return spendByTeamId
}

/**
 * The teams the user belongs to with their role in each, for the teams page.
 */
export async function loadTeamSummaries(userId: string): Promise<TeamSummary[]> {
	// one join returns the team and the user's role
	const teamRows = await db
		.select({
			teamId: teams.id,
			name: teams.name,
			role: teamMembers.role,
			isPublic: teams.isPublic,
			description: teams.description,
			avatarKey: teams.avatarKey,
			// who invited the user, null when they joined on their own or the inviter's account closed
			inviterUserId: inviters.id,
			inviterUsername: inviters.username,
			inviterAvatarSource: inviters.avatarSource,
		})
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.leftJoin(inviters, eq(inviters.id, teamMembers.invitedByUserId))
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
		.orderBy(teams.createdAt)

	// each team's counts, shared with the received invitations that render beside these rows
	const teamIds = teamRows.map((teamRow) => teamRow.teamId)
	const countsByTeamId = await toCountsByTeamId(teamIds)

	// how many active leaders each team has
	const teamLeaderRows = await db
		.select({ teamId: teamMembers.teamId, leaderCount: count() })
		.from(teamMembers)
		.where(and(inArray(teamMembers.teamId, teamIds), eq(teamMembers.isActive, true), eq(teamMembers.role, "leader")))
		.groupBy(teamMembers.teamId)
	const leaderCountByTeamId = new Map(
		teamLeaderRows.map((teamLeaderRow) => [teamLeaderRow.teamId, teamLeaderRow.leaderCount]),
	)

	// what each team's topics cost this month, and the user's unseen team chat room mentions
	const spendByTeamId = await toSpendByTeamId(teamIds)
	const mentionsByTeamId = await loadTeamChatMentions(userId, teamIds)
	return teamRows.map(({ avatarKey, inviterUserId, inviterUsername, inviterAvatarSource, ...row }) => ({
		...row,
		invitedBy:
			inviterUserId && inviterUsername
				? { userId: inviterUserId, username: inviterUsername, avatarSource: inviterAvatarSource }
				: null,
		isOnlyLeader: isLeaderRole(row.role) && (leaderCountByTeamId.get(row.teamId) ?? 0) <= 1,
		memberCount: countsByTeamId.get(row.teamId)?.memberCount ?? 1,
		topicCount: countsByTeamId.get(row.teamId)?.topicCount ?? 0,
		hasAvatar: avatarKey !== null,
		scanSpendCents: spendByTeamId.get(row.teamId)?.scanCents ?? 0,
		chatSpendCents: spendByTeamId.get(row.teamId)?.chatCents ?? 0,
		chatMentions: mentionsByTeamId.get(row.teamId) ?? [],
	}))
}

/**
 * The teams a user belongs to as another user sees them: the public ones they are a member of.
 * Who invited them and their unopened chat mentions belong to the user's teams page.
 */
export async function loadPublicTeams(userId: string): Promise<TeamSummary[]> {
	// a membership to a team that isn't public does not show up on the profile for a visitor
	const teamRows = await db
		.select({
			teamId: teams.id,
			name: teams.name,
			description: teams.description,
			isPublic: teams.isPublic,
			avatarKey: teams.avatarKey,
			role: teamMembers.role,
		})
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(
			and(
				eq(teamMembers.userId, userId),
				eq(teamMembers.isActive, true),
				eq(teamMembers.isMemberVisible, true),
				eq(teams.isPublic, true),
			),
		)
		.orderBy(teams.name)

	// the counts the team row's subtables open, loaded for every listed team at once
	const countsByTeamId = await toCountsByTeamId(teamRows.map((teamRow) => teamRow.teamId))
	return teamRows.map((teamRow) => ({
		teamId: teamRow.teamId,
		name: teamRow.name,
		description: teamRow.description,
		isPublic: teamRow.isPublic,
		hasAvatar: teamRow.avatarKey !== null,
		memberCount: countsByTeamId.get(teamRow.teamId)?.memberCount ?? 0,
		topicCount: countsByTeamId.get(teamRow.teamId)?.topicCount ?? 0,
		// a team's spend is its members' business, so a profile visitor is told none of it
		scanSpendCents: 0,
		chatSpendCents: 0,
		role: teamRow.role,
		isOnlyLeader: false,
		invitedBy: null,
		chatMentions: [],
	}))
}

// each team's active-member and topic counts, one grouped query per table
async function toCountsByTeamId(teamIds: string[]): Promise<Map<string, { memberCount: number; topicCount: number }>> {
	if (teamIds.length === 0) {
		return new Map()
	}
	// the active members, the team owned topics, and the shared team topics
	const [memberRows, ownedTopicRows, sharedTopicRows] = await Promise.all([
		db
			.select({ teamId: teamMembers.teamId, memberCount: count() })
			.from(teamMembers)
			.where(and(inArray(teamMembers.teamId, teamIds), eq(teamMembers.isActive, true)))
			.groupBy(teamMembers.teamId),
		db
			.select({ teamId: topics.teamId, topicCount: count() })
			.from(topics)
			.where(inArray(topics.teamId, teamIds))
			.groupBy(topics.teamId),
		db
			.select({ teamId: teamTopics.teamId, topicCount: count() })
			.from(teamTopics)
			.where(inArray(teamTopics.teamId, teamIds))
			.groupBy(teamTopics.teamId),
	])

	// the team topics are the owned ones plus the shared ones
	const topicCountByTeamId = new Map(
		ownedTopicRows.map((ownedTopicRow) => [ownedTopicRow.teamId, ownedTopicRow.topicCount]),
	)
	for (const sharedTopicRow of sharedTopicRows) {
		topicCountByTeamId.set(
			sharedTopicRow.teamId,
			(topicCountByTeamId.get(sharedTopicRow.teamId) ?? 0) + sharedTopicRow.topicCount,
		)
	}
	const memberCountByTeamId = new Map(memberRows.map((memberRow) => [memberRow.teamId, memberRow.memberCount]))
	return new Map(
		teamIds.map((teamId) => [
			teamId,
			{ memberCount: memberCountByTeamId.get(teamId) ?? 0, topicCount: topicCountByTeamId.get(teamId) ?? 0 },
		]),
	)
}

/**
 * The team page payload by id, or null when the user does not have access.
 * the page is for members always, for admins always, and for anyone if the team is public.
 */
export async function loadTeamPage(userId: string | null, teamId: string): Promise<TeamPageResponse | null> {
	// select the team for the id
	const [team] = await db.select().from(teams).where(eq(teams.id, teamId))
	if (!team) {
		return null
	}

	// the team page's independent reads run together. nothing returns until the access gate below passes
	const [role, memberRows, topicRows, chatMentionsByTeam] = await Promise.all([
		toTeamRole(userId, team.id),
		// the members with the not-yet-activated rows included
		db
			.select({
				userId: users.id,
				username: users.username,
				avatarSource: users.avatarSource,
				role: teamMembers.role,
				isMemberVisible: teamMembers.isMemberVisible,
				isActive: teamMembers.isActive,
			})
			.from(teamMembers)
			.innerJoin(users, eq(users.id, teamMembers.userId))
			.where(eq(teamMembers.teamId, team.id))
			.orderBy(teamMembers.createdAt),
		loadTeamTopics(team.id),
		loadTeamChatMentions(userId, [team.id]),
	])

	// a private team's page reads as a missing one to everyone but its members, an admin, and someone with a pending invite
	const isMember = role !== null
	const isInvited = !isMember && (await hasPendingTeamInvite(userId, team.id))
	if (!team.isPublic && !isMember && !isInvited && !(await isAllowed(userId, "admin:console"))) {
		return null
	}

	// members see everyone, and only a leader can see who asked to join
	const isTeamLeader = isMember && isLeaderRole(role)
	const shownMembers = memberRows.filter(
		(memberRow) => (memberRow.isActive || isTeamLeader) && (isMember || memberRow.isMemberVisible),
	)

	// the hidden count reads activated rows alone, so a waiting request never shows through the number
	const activeRows = memberRows.filter((memberRow) => memberRow.isActive)
	const hiddenActiveCount =
		activeRows.length - activeRows.filter((memberRow) => isMember || memberRow.isMemberVisible).length

	// the team's topics: an outsider sees only the public ones, a member or someone with a pending invite sees them all
	const visibleTopics = topicRows.filter((topicRow) => isMember || isInvited || topicRow.visibility === "public")

	return {
		teamId: team.id,
		name: team.name,
		description: team.description,
		isPublic: team.isPublic,
		hasAvatar: team.avatarKey !== null,
		role,
		hasRequestedToJoin: memberRows.some((memberRow) => memberRow.userId === userId && !memberRow.isActive),
		members: shownMembers.map((memberRow) => ({
			userId: memberRow.userId,
			username: memberRow.username,
			avatarSource: memberRow.avatarSource,
			role: memberRow.role,
			isMemberVisible: memberRow.isMemberVisible,
			isActive: memberRow.isActive,
		})),
		hiddenMemberCount: hiddenActiveCount,
		chatMentions: chatMentionsByTeam.get(team.id) ?? [],
		topics: await toTopicTableRows(visibleTopics, userId),
	}
}

// whether a pending invite names this user, by account or by their email address
async function hasPendingTeamInvite(userId: string | null, teamId: string): Promise<boolean> {
	if (!userId) {
		return false
	}

	// a single matching pending invite row is enough. an address matches only once the account verified it
	const [invite] = await db
		.select({ id: invites.id })
		.from(invites)
		.where(
			and(
				eq(invites.teamId, teamId),
				or(eq(invites.invitedUserId, userId), inArray(invites.email, verifiedEmailQuery(userId))),
				eq(invites.usedCount, 0),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
			),
		)
		.limit(1)
	return Boolean(invite)
}

// the topics a team holds: its own plus the ones shared into it
async function loadTeamTopics(teamId: string): Promise<(typeof topics.$inferSelect)[]> {
	const ownedTopicRows = await db.select().from(topics).where(eq(topics.teamId, teamId))
	// a shared topic is reached through its team_topics row instead of the team column
	const sharedTopicRows = await db
		.select()
		.from(teamTopics)
		.innerJoin(topics, eq(topics.id, teamTopics.topicId))
		.where(eq(teamTopics.teamId, teamId))
	return [...ownedTopicRows, ...sharedTopicRows.map((topicRow) => topicRow.topics)]
}
