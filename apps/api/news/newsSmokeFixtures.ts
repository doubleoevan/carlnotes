// the news smoke's fixtures: the run's ids, the people, Teams, and Topics it seeds, what happened on them, and
// the cleanup

import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { comments, reactions } from "@carlnotes/db/schema/social"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { userBlocks } from "@carlnotes/db/schema/userBlocks"
import { users } from "@carlnotes/db/schema/users"
import { inArray, like } from "drizzle-orm"

// the ids of this run's rows, which a parallel run never shares
const runId = `news-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
export const toRunId = (name: string): string => `${runId}-${name}`

// the person whose news it is, the people around them, a signed-in stranger, and an admin
export const userIds = {
	person: toRunId("person"),
	teammate: toRunId("teammate"),
	followedOwner: toRunId("followed-owner"),
	// the two people who react, the two sides of the user blocks, and the two readers from outside
	firstReactor: toRunId("reactor-1"),
	secondReactor: toRunId("reactor-2"),
	blocked: toRunId("blocked"),
	blocker: toRunId("blocker"),
	stranger: toRunId("stranger"),
	admin: toRunId("admin"),
}

// the person's own Topics, their Teams' Topics, and the Topics they follow
export const topicIds = {
	ownPublic: toRunId("own-public"),
	ownPrivate: toRunId("own-private"),
	team: toRunId("team"),
	hiddenTeam: toRunId("hidden-team"),
	followed: toRunId("followed"),
	invite: toRunId("invite"),
	// two Topics of someone else that the person neither holds nor follows
	otherPublic: toRunId("other-public"),
	otherPrivate: toRunId("other-private"),
}
const teamIds = { shown: toRunId("team-shown"), hidden: toRunId("team-hidden") }

// how many extra Findings fill the own Topic, so the week holds more than two pages
const EXTRA_FINDING_COUNT = 30

// a time some minutes before the run
const startedAt = Date.now()
export const toMinutesAgo = (minutes: number): Date => new Date(startedAt - minutes * 60_000)

// the users, the Topics, the two Teams, the subscriptions, and the user blocks
export async function seedPeopleAndTopics(): Promise<void> {
	// every person, the admin with the admin role
	await db.insert(users).values(
		Object.values(userIds).map((userId) => ({
			id: userId,
			name: userId,
			email: `${userId}@carlnotes.test`,
			username: userId,
			usernameNormalized: userId.replaceAll("-", "").toLowerCase(),
			role: userId === userIds.admin ? "admin" : "user",
		})),
	)

	// one public Team that shows the person's membership, and one that hides it, named for the run because team names
	// are unique. the person leads both, so the profile's tiles read them
	await db.insert(teams).values([
		{ id: teamIds.shown, name: toRunId("shown team"), isPublic: true },
		{ id: teamIds.hidden, name: toRunId("hidden team"), isPublic: true },
	])
	await db.insert(teamMembers).values([
		{ teamId: teamIds.shown, userId: userIds.person, role: "leader" },
		{ teamId: teamIds.shown, userId: userIds.teammate, role: "leader" },
		{ teamId: teamIds.hidden, userId: userIds.person, role: "leader", isMemberVisible: false },
		{ teamId: teamIds.hidden, userId: userIds.teammate, role: "leader" },
	])

	// the Topics. the person's public Topic is also shared with their shown Team
	await db.insert(topics).values([
		{ id: topicIds.ownPublic, ownerId: userIds.person, name: "own public", visibility: "public" },
		{ id: topicIds.ownPrivate, ownerId: userIds.person, name: "own private", visibility: "private" },
		{ id: topicIds.team, ownerId: userIds.teammate, teamId: teamIds.shown, name: "team", visibility: "public" },
		{
			id: topicIds.hiddenTeam,
			ownerId: userIds.teammate,
			teamId: teamIds.hidden,
			name: "hidden",
			visibility: "public",
		},
		{ id: topicIds.followed, ownerId: userIds.followedOwner, name: "followed", visibility: "public" },
		{ id: topicIds.invite, ownerId: userIds.followedOwner, name: "invite", visibility: "invite" },
		{ id: topicIds.otherPublic, ownerId: userIds.followedOwner, name: "other public", visibility: "public" },
		{ id: topicIds.otherPrivate, ownerId: userIds.followedOwner, name: "other private", visibility: "private" },
	])
	await db.insert(teamTopics).values({ teamId: teamIds.shown, topicId: topicIds.ownPublic })

	// the person follows two Topics, the invite one since two hours ago, and is in a user block each way
	await db.insert(subscriptions).values([
		{ topicId: topicIds.followed, subscriberUserId: userIds.person },
		{ topicId: topicIds.invite, subscriberUserId: userIds.person, createdAt: toMinutesAgo(120) },
	])
	await db.insert(userBlocks).values([
		{ blockerUserId: userIds.person, blockedUserId: userIds.blocked },
		{ blockerUserId: userIds.blocker, blockedUserId: userIds.person },
	])
}

// a Finding on a Topic, kept some minutes ago by a Scan that started then or earlier
async function seedFinding(
	name: string,
	topicId: string,
	minutesAgo: number,
	options: { scanMinutesAgo?: number; rating?: "down" } = {},
): Promise<string> {
	// the resource and the Scan the Finding hangs on
	const findingId = toRunId(name)
	await db.insert(resources).values({ id: findingId, url: `https://carlnotes.test/${findingId}`, kind: "read" })
	const [scan] = await db
		.insert(scans)
		.values({
			topicId,
			ownerId: userIds.followedOwner,
			status: "succeeded",
			startedAt: toMinutesAgo(options.scanMinutesAgo ?? minutesAgo),
		})
		.returning()
	await db.insert(findings).values({
		id: findingId,
		topicId,
		resourceId: findingId,
		scanId: scan?.id ?? "",
		foundScanId: scan?.id ?? "",
		relevanceScore: 0.9,
		rating: options.rating,
		createdAt: toMinutesAgo(minutesAgo),
	})
	return findingId
}

// a Comment by one user on a Topic or on one of its Findings, some minutes ago
async function seedComment(
	name: string,
	authorUserId: string,
	topicId: string,
	minutesAgo: number,
	options: { findingId?: string; parentCommentId?: string; body?: string } = {},
): Promise<string> {
	const commentId = toRunId(name)
	await db.insert(comments).values({
		id: commentId,
		authorUserId,
		// a Comment hangs on its Finding, or on the Topic itself
		findingId: options.findingId,
		topicId: options.findingId ? undefined : topicId,
		targetTopicId: topicId,
		parentCommentId: options.parentCommentId,
		body: options.body ?? `${name} body`,
		createdAt: toMinutesAgo(minutesAgo),
	})
	return commentId
}

// a reaction by one user on a Comment or a Finding of a Topic, some minutes ago
async function seedReaction(
	userId: string,
	topicId: string,
	minutesAgo: number,
	target: { commentId: string } | { findingId: string },
): Promise<void> {
	await db
		.insert(reactions)
		.values({ userId, targetTopicId: topicId, reactionType: "like", createdAt: toMinutesAgo(minutesAgo), ...target })
}

// what happened on the person's own Topics and Comments
export async function seedOwnEvents(): Promise<void> {
	// a Podcast Episode three days ago, and one at the same time as a Finding
	await db.insert(podcastEpisodes).values([
		{
			id: toRunId("old-episode"),
			topicId: topicIds.ownPublic,
			ownerId: userIds.person,
			status: "published",
			season: 2026,
			episodeNumber: 1,
			publishedAt: toMinutesAgo(3 * 24 * 60),
		},
		{
			id: toRunId("tied-episode"),
			topicId: topicIds.ownPublic,
			ownerId: userIds.person,
			status: "published",
			season: 2026,
			episodeNumber: 2,
			publishedAt: toMinutesAgo(40),
		},
	])
	await seedFinding("tied-finding", topicIds.ownPublic, 40)

	// a Comment on the public Topic, a Finding on the private one, and the Findings that fill the pages
	await seedComment("own-comment", userIds.firstReactor, topicIds.ownPublic, 120, {
		body: "https://example.com first line\nsecond line",
	})
	await seedFinding("private-finding", topicIds.ownPrivate, 50)
	for (let i = 0; i < EXTRA_FINDING_COUNT; i++) {
		await seedFinding(`extra-finding-${i}`, topicIds.ownPublic, 200 + i)
	}

	// the person's Comment on a Topic they follow, five days old, with a reply and three reactions inside the hour
	const personCommentId = await seedComment("person-comment", userIds.person, topicIds.followed, 5 * 24 * 60)
	await seedComment("reply", userIds.teammate, topicIds.followed, 20, { parentCommentId: personCommentId })
	await seedReaction(userIds.firstReactor, topicIds.followed, 30, { commentId: personCommentId })
	await seedReaction(userIds.secondReactor, topicIds.followed, 10, { commentId: personCommentId })
	await seedReaction(userIds.blocked, topicIds.followed, 5, { commentId: personCommentId })
}

// the person's published Topic Posts: one with its own image on a public Topic they neither hold nor follow, one on
// a Topic they follow, and one on a private Topic they may no longer open
export async function seedPersonTopicPosts(): Promise<void> {
	const personPost = { authorUserId: userIds.person, title: "a post" }
	await db.insert(topicPosts).values([
		{
			...personPost,
			id: toRunId("other-post"),
			topicId: topicIds.otherPublic,
			imageHash: "posthash",
			publishedAt: toMinutesAgo(35),
		},
		{ ...personPost, id: toRunId("followed-post"), topicId: topicIds.followed, publishedAt: toMinutesAgo(34) },
		{ ...personPost, id: toRunId("closed-post"), topicId: topicIds.otherPrivate, publishedAt: toMinutesAgo(33) },
	])
}

// what happened on the Topics of the person's Teams and on the Topics they follow
export async function seedTeamAndFollowedEvents(): Promise<void> {
	await seedComment("team-comment", userIds.teammate, topicIds.team, 15)
	await seedFinding("hidden-team-finding", topicIds.hiddenTeam, 25)

	// a Finding with two reactions, and Comments by the two people in a user block with the person
	const followedFindingId = await seedFinding("followed-finding", topicIds.followed, 3)
	await seedReaction(userIds.firstReactor, topicIds.followed, 2, { findingId: followedFindingId })
	await seedReaction(userIds.secondReactor, topicIds.followed, 1, { findingId: followedFindingId })
	await seedComment("blocked-comment", userIds.blocked, topicIds.followed, 8)
	await seedComment("blocker-comment", userIds.blocker, topicIds.followed, 9)

	// a Finding rated thumbs down, with a Comment and a reaction on it
	const ratedDownFindingId = await seedFinding("rated-down-finding", topicIds.followed, 12, { rating: "down" })
	await seedComment("rated-down-comment", userIds.firstReactor, topicIds.followed, 11, {
		findingId: ratedDownFindingId,
	})
	await seedReaction(userIds.secondReactor, topicIds.followed, 11, { findingId: ratedDownFindingId })

	// the invite Topic's Findings from a Scan before the person's activation and from one after it
	await seedFinding("early-invite-finding", topicIds.invite, 60, { scanMinutesAgo: 300 })
	await seedFinding("late-invite-finding", topicIds.invite, 55, { scanMinutesAgo: 60 })
}

// delete the run's Topics, Teams, resources, and users, which takes every other row with them
export async function cleanUp(): Promise<void> {
	await db.delete(topics).where(inArray(topics.id, Object.values(topicIds)))
	await db.delete(teams).where(inArray(teams.id, Object.values(teamIds)))
	await db.delete(resources).where(like(resources.id, `${runId}-%`))
	await db.delete(users).where(like(users.id, `${runId}-%`))
}
