// the helpers for the topic's reads and writes
import type { Invite, Topic, TopicResponse, TopicScan, UpdateTopicPayload } from "@shared/contracts"
import { isDailyFrequency } from "@shared/enums"
import { reportError } from "@shared/monitoring"
import { and, count, desc, eq, exists, inArray, isNull, notInArray, or, sql } from "drizzle-orm"
import { db } from "../../db"
import { dailyScanLimit, dailyTopicIdsWithinLimit } from "../../db/quotas"
import {
	bookmarks,
	findings,
	invites,
	scans,
	type sources,
	subscriptions,
	teamMembers,
	teams,
	teamTopics,
	topics,
	users,
} from "../../db/schema"
import { lookupPodcast, scanTopic, screenPendingSources, screenTopicSources } from "../../worker"
import { isAllowed, isMonthlySpendExhausted, loadDailyFrequencyAuthorization, loadUserAccess } from "../authorization"
import { loadPendingTopicInvites } from "../invite/invites"
import { loadFeaturedTopics } from "./featuring"
import { loadTopicFindings } from "./findings"
import { subscriptionActivatedAt, toTopicRole, verifiedEmailQuery } from "./permissions"
import { scansRemaining } from "./quotas"

// a rejected attempt to add one more topic on a daily frequency, including the plan's limit so the message can show it
export type DailyFrequencyRejection = { status: "dailyFrequency"; limit: number }

// a Source that the payload adds instead of an existing one
export type NewTopicSource = Extract<UpdateTopicPayload["sources"][number], { sourceKind: string }>
export type Scan = typeof scans.$inferSelect

// the invite topic's name for this id, or null if there is none
export async function toInviteTopic(topicId: string): Promise<{ name: string | null } | null> {
	// the visibility says whether there is a gate, and the name is what it shows
	const [topic] = await db
		.select({ visibility: topics.visibility, name: topics.name })
		.from(topics)
		.where(eq(topics.id, topicId))
	// an invite topic is the only one with a gate
	if (topic?.visibility !== "invite") {
		return null
	}
	// the name alone. a null result already says there is no invite topic to gate
	return { name: topic.name }
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
		}))
}

// attach the bookmarks from the team that owns the topic to its topic findings
export async function attachTeamBookmarks(
	topicFindings: Awaited<ReturnType<typeof loadTopicFindings>>,
	topicId: string,
	owningTeamId: string | null,
): Promise<void> {
	// build the subquery to check if a user belongs to the team that owns the topic
	const topicTeamIds = db.select({ teamId: teamTopics.teamId }).from(teamTopics).where(eq(teamTopics.topicId, topicId))
	const isTopicOwningMember = or(
		inArray(teamMembers.teamId, topicTeamIds),
		owningTeamId ? eq(teamMembers.teamId, owningTeamId) : sql`false`,
	)

	// select the bookmarks from the team that owns the topic
	const teamBookmarkRows = await db
		.selectDistinct({
			findingId: bookmarks.findingId,
			userId: users.id,
			username: users.username,
			avatarSource: users.avatarSource,
		})
		.from(bookmarks)
		.innerJoin(findings, and(eq(bookmarks.findingId, findings.id), eq(findings.topicId, topicId)))
		.innerJoin(
			teamMembers,
			and(eq(teamMembers.userId, bookmarks.userId), eq(teamMembers.isActive, true), isTopicOwningMember),
		)
		.innerJoin(users, eq(users.id, bookmarks.userId))

	// attach the team bookmarks to the topic findings
	const bookmarksByFindingId = Map.groupBy(teamBookmarkRows, (row) => row.findingId)
	for (const topicFinding of topicFindings) {
		topicFinding.teamBookmarks = (bookmarksByFindingId.get(topicFinding.findingId) ?? []).map((bookmark) => ({
			userId: bookmark.userId,
			username: bookmark.username,
			avatarSource: bookmark.avatarSource,
		}))
	}
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

// the user's topic access and the findings it gates
export async function loadTopicAccessAndFindings(
	topic: typeof topics.$inferSelect,
	userId: string | null,
): Promise<{ isAdmin: boolean; topicFindings: Awaited<ReturnType<typeof loadTopicFindings>> }> {
	// only the owner and admins can see the spend
	const { isAdmin } = userId ? await loadUserAccess(userId) : { isAdmin: false }

	// the topic findings with this user's consumed state, gated by when an invite was accepted
	const topicFindings = await loadTopicFindings(
		topic.id,
		userId,
		await topicSubscriptionStartDate(topic, userId, isAdmin),
	)
	await attachTeamBookmarks(topicFindings, topic.id, topic.teamId)
	return { isAdmin, topicFindings }
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
		isCredited && teamId && teamRow ? { teamId, name: teamRow.name, hasAvatar: teamRow.avatarKey !== null } : null

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
 * Whether saving this frequency takes a new daily slot
 */
export function isTakingDailySlot(savedFrequency: string, currentFrequency?: string): boolean {
	return isDailyFrequency(savedFrequency) && !isDailyFrequency(currentFrequency ?? "")
}

/**
 * The rejection when a payload moves a topic onto a daily frequency past the plan's daily topic limit, or null if not
 */
export async function authorizeNewDailyTopic(
	userId: string,
	topicPayload: UpdateTopicPayload,
	currentFrequency?: string,
): Promise<DailyFrequencyRejection | null> {
	if (!isTakingDailySlot(topicPayload.frequency, currentFrequency)) {
		return null
	}
	const authorization = await loadDailyFrequencyAuthorization(userId)
	return authorization.status === "quota" ? { status: "dailyFrequency", limit: authorization.limit } : null
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

// a new topic Source row
export function toNewSourceRow(
	topicId: string,
	source: NewTopicSource,
	podcastNames: Map<string, string>,
): typeof sources.$inferInsert {
	// a podcast Source keeps the show's name beside its id, so it reads by name instead of by number
	const podcastId = source.config.podcastId
	const podcastName = typeof podcastId === "string" ? podcastNames.get(podcastId) : undefined
	return {
		topicId,
		kind: source.sourceKind,
		config: podcastName ? { ...source.config, name: podcastName } : source.config,
		status: source.sourceKind === "url" ? "pending" : "ready",
	}
}

// the show names for the podcast Sources this payload adds, read before the writing
export async function toPodcastNames(payloadSources: UpdateTopicPayload["sources"]): Promise<Map<string, string>> {
	// the ids this payload adds without a name of their own
	const podcastIds = payloadSources.flatMap((source) =>
		"id" in source ||
		source.sourceKind !== "podcast" ||
		typeof source.config.podcastId !== "string" ||
		typeof source.config.name === "string"
			? []
			: [source.config.podcastId],
	)
	if (podcastIds.length === 0) {
		return new Map()
	}

	// look every show up at once. iTunes being unreachable costs a name, but not the save
	const podcasts = await Promise.all(podcastIds.map((podcastId) => lookupPodcast(podcastId).catch(() => null)))
	return new Map(podcasts.flatMap((podcast) => (podcast ? [[podcast.podcastId, podcast.name] as const] : [])))
}

// start the llm-guard screen for the Topic's newly saved url Sources asynchronously, without delaying the save
export function startPendingSourceScreens(topicId: string): void {
	screenPendingSources(topicId).catch((error) => {
		console.error(`could not start source screens for topic ${topicId}`, error)
		reportError(error, "source-screen", { topicId })
	})
}

// screen the new Topic's url Sources with llm-guard, then start the Scan
export async function startFirstScan(topicId: string, firstScan: Scan | undefined, ownerId: string): Promise<void> {
	await screenTopicSources(topicId)
	if (firstScan) {
		await scanTopic(firstScan, topicId, ownerId, "creation")
	}
}

// how many topic options to show in the add to team dropdown
const TEAM_TOPIC_OPTIONS_LIMIT = 500

/**
 * The topics this user may add to a team: their own at any visibility first, then every public topic,
 * and the invite topics they can read, each group alphabetical.
 */
export async function loadTeamTopicOptions(userId: string, teamId?: string): Promise<{ id: string; name: string }[]> {
	// an invite topic counts when the user has an active subscription or a pending invite to it
	const hasSubscription = exists(
		db
			.select({ id: subscriptions.topicId })
			.from(subscriptions)
			.where(
				and(
					eq(subscriptions.topicId, topics.id),
					eq(subscriptions.subscriberUserId, userId),
					eq(subscriptions.isActive, true),
				),
			),
	)
	const hasInvite = exists(
		db
			.select({ id: invites.id })
			.from(invites)
			.where(
				and(
					eq(invites.topicId, topics.id),
					// an address matches only once the account verified it
					or(eq(invites.invitedUserId, userId), inArray(invites.email, verifiedEmailQuery(userId))),
					isNull(invites.declinedAt),
					or(isNull(invites.expiresAt), sql`${invites.expiresAt} > now()`),
					sql`${invites.usedCount} < ${invites.maxUses}`,
				),
			),
	)

	// one query builds the list of topics to add, the user's own topics leading. what team already has is left out.
	const addableTopics = teamId
		? [
				sql`${topics.teamId} is distinct from ${teamId}`,
				notInArray(
					topics.id,
					db.select({ topicId: teamTopics.topicId }).from(teamTopics).where(eq(teamTopics.teamId, teamId)),
				),
			]
		: []
	return db
		.select({ id: topics.id, name: topics.name })
		.from(topics)
		.where(
			and(
				...addableTopics,
				or(
					eq(topics.ownerId, userId),
					eq(topics.visibility, "public"),
					and(eq(topics.visibility, "invite"), or(hasSubscription, hasInvite)),
				),
			),
		)
		.orderBy(desc(eq(topics.ownerId, userId)), sql`lower(${topics.name})`)
		.limit(TEAM_TOPIC_OPTIONS_LIMIT)
}

/**
 * The topic table rows that the profile page and the team page both render.
 */
export async function toTopicTableRows(
	topicRows: {
		id: string
		name: string
		visibility: (typeof topics.$inferSelect)["visibility"]
		createdAt: Date
		updatedAt: Date
		subscriberCount: number
	}[],
	// whose email switch to read, absent on a page that shows somebody else's topics
	userId?: string | null,
): Promise<Topic[]> {
	// kept counts the topic's findings saved, and seen sums the topic's findings that succeeded scans reviewed
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [keptAndSeenTopicFindings, emailByTopic] = await Promise.all([
		loadFindingsKeptAndResourcesSeen(topicIds),
		loadTopicsEmailPreferences(userId, topicIds),
	])
	return topicRows.map((topicRow) => ({
		id: topicRow.id,
		name: topicRow.name,
		visibility: topicRow.visibility,
		createdAt: topicRow.createdAt.toISOString(),
		updatedAt: topicRow.updatedAt.toISOString(),
		subscriberCount: topicRow.subscriberCount,
		keptCount: keptAndSeenTopicFindings.get(topicRow.id)?.kept ?? 0,
		seenCount: keptAndSeenTopicFindings.get(topicRow.id)?.seen ?? 0,
		isEmailEnabled: emailByTopic.get(topicRow.id) ?? null,
	}))
}

// the user's own email switch on each of their followed topics
async function loadTopicsEmailPreferences(
	userId: string | null | undefined,
	topicIds: string[],
): Promise<Map<string, boolean>> {
	if (!userId || topicIds.length === 0) {
		return new Map()
	}
	// one row per followed topic with its email enabled status
	const subscriptionRows = await db
		.select({ topicId: subscriptions.topicId, isEmailEnabled: subscriptions.isEmailEnabled })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
				inArray(subscriptions.topicId, topicIds),
			),
		)
	return new Map(subscriptionRows.map((subscriptionRow) => [subscriptionRow.topicId, subscriptionRow.isEmailEnabled]))
}

// topic findings kept and resources seen, per topic summed for every scan
async function loadFindingsKeptAndResourcesSeen(
	topicIds: string[],
): Promise<Map<string, { kept: number; seen: number }>> {
	if (topicIds.length === 0) {
		return new Map()
	}
	// kept is the findings the topic holds. seen is what its scans reviewed, kept and filtered together
	const [keptFindingRows, seenResourceRows] = await Promise.all([
		db
			.select({ topicId: findings.topicId, kept: count() })
			.from(findings)
			.where(inArray(findings.topicId, topicIds))
			.groupBy(findings.topicId),
		db
			.select({
				topicId: scans.topicId,
				seen: sql<number>`coalesce(sum(${scans.keptCount} + ${scans.filteredCount}), 0)`,
			})
			.from(scans)
			.where(and(inArray(scans.topicId, topicIds), eq(scans.status, "succeeded")))
			.groupBy(scans.topicId),
	])

	// merge the two aggregates, with zero filling in for a topic absent from either
	const keptByTopicId = new Map(keptFindingRows.map((keptFindingRow) => [keptFindingRow.topicId, keptFindingRow.kept]))
	const seenByTopicId = new Map(
		seenResourceRows.map((seenResourceRow) => [seenResourceRow.topicId, Number(seenResourceRow.seen)]),
	)
	return new Map(
		topicIds.map((topicId) => [
			topicId,
			{ kept: keptByTopicId.get(topicId) ?? 0, seen: seenByTopicId.get(topicId) ?? 0 },
		]),
	)
}
