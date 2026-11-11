// a live smoke test for the news read against the dev database: the windows, the three groups and their order, ties,
// the reactions on one Comment as one row, a Finding rated thumbs down, an invite Topic's activation, the user blocks
// in both directions, the person's own Topic Posts, someone else's profile, and the pages
// run it with: bun run smoke:news. needs Doppler secrets

import { NEWS_PAGE_SIZE, type NewsEvent, type NewsWindow } from "@carlnotes/contracts/news"

// the tables the run seeds
const { connectionPool, db } = await import("@carlnotes/db")
const { podcastEpisodes } = await import("@carlnotes/db/schema/podcast")
const { findings, resources, scans } = await import("@carlnotes/db/schema/scans")
const { comments, reactions } = await import("@carlnotes/db/schema/social")
const { topicPosts } = await import("@carlnotes/db/schema/topicPosts")

// the people, their Teams, and their Topics
const { teamMembers, teams } = await import("@carlnotes/db/schema/teams")
const { teamTopics } = await import("@carlnotes/db/schema/teamTopics")
const { subscriptions, topics } = await import("@carlnotes/db/schema/topics")
const { userBlocks } = await import("@carlnotes/db/schema/userBlocks")
const { users } = await import("@carlnotes/db/schema/users")
const { inArray, like } = await import("drizzle-orm")

// the read under test
const { readNews } = await import("./readNews")

// the ids of this run's rows, which a parallel run never shares
const runId = `news-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
const toRunId = (name: string): string => `${runId}-${name}`

// the person whose news it is, the people around them, and a signed-in stranger
const userIds = {
	person: toRunId("person"),
	teammate: toRunId("teammate"),
	followedOwner: toRunId("followed-owner"),
	firstReactor: toRunId("reactor-1"),
	secondReactor: toRunId("reactor-2"),
	blocked: toRunId("blocked"),
	blocker: toRunId("blocker"),
	stranger: toRunId("stranger"),
}

// the person's own Topics, their Teams' Topics, and the Topics they follow
const topicIds = {
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
const toMinutesAgo = (minutes: number): Date => new Date(startedAt - minutes * 60_000)

// each check's result, counted for the exit code
let failureCount = 0
function check(label: string, isTestPassing: boolean, detail?: unknown): void {
	console.log(`${isTestPassing ? "ok  " : "FAIL"} ${label}`, isTestPassing || detail === undefined ? "" : detail)
	failureCount += isTestPassing ? 0 : 1
}

// the users, the Topics, the two Teams, the subscriptions, and the user blocks
async function seedPeopleAndTopics(): Promise<void> {
	await db.insert(users).values(
		Object.values(userIds).map((userId) => ({
			id: userId,
			name: userId,
			email: `${userId}@carlnotes.test`,
			username: userId,
			usernameNormalized: userId.replaceAll("-", "").toLowerCase(),
		})),
	)

	// one public Team that shows the person's membership, and one that hides it
	await db.insert(teams).values([
		{ id: teamIds.shown, name: "shown team", isPublic: true },
		{ id: teamIds.hidden, name: "hidden team", isPublic: true },
	])
	await db.insert(teamMembers).values([
		{ teamId: teamIds.shown, userId: userIds.person },
		{ teamId: teamIds.shown, userId: userIds.teammate, role: "leader" },
		{ teamId: teamIds.hidden, userId: userIds.person, isMemberVisible: false },
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
async function seedOwnEvents(): Promise<void> {
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
async function seedPersonTopicPosts(): Promise<void> {
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
async function seedTeamAndFollowedEvents(): Promise<void> {
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
async function cleanUp(): Promise<void> {
	await db.delete(topics).where(inArray(topics.id, Object.values(topicIds)))
	await db.delete(teams).where(inArray(teams.id, Object.values(teamIds)))
	await db.delete(resources).where(like(resources.id, `${runId}-%`))
	await db.delete(users).where(like(users.id, `${runId}-%`))
}

// every row of a reader's window of the person's news, read page by page, with each page's size and the total
async function readEveryPage(
	userId: string | null,
	window: NewsWindow,
): Promise<{ newsEvents: NewsEvent[]; pageSizes: number[]; total: number }> {
	const newsEvents: NewsEvent[] = []
	const pageSizes: number[] = []
	let total = 0
	let cursor: string | undefined
	let page = 1

	// read each numbered page with the first page's cursor, until every row is read
	do {
		const newsPage = await readNews({ profileUserId: userIds.person, userId, window, page, cursor })
		if (!newsPage) {
			throw new Error("the news read rejected its own cursor")
		}
		// keep the page's rows and its size, and move to the next page
		newsEvents.push(...newsPage.newsEvents)
		pageSizes.push(newsPage.newsEvents.length)
		total = newsPage.total
		cursor = newsPage.cursor
		page += 1
	} while (newsEvents.length < total && pageSizes.at(-1) !== 0)
	return { newsEvents, pageSizes, total }
}

// the ids of the Podcast Episodes the hour's pages of the person's own news play
async function readEveryPodcastEpisodeId(): Promise<Set<string>> {
	const firstPage = await readNews({ profileUserId: userIds.person, userId: userIds.person, window: "hour", page: 1 })
	const pageCount = Math.ceil((firstPage?.total ?? 0) / NEWS_PAGE_SIZE)
	const podcastEpisodeIds = new Set<string>()

	// each page returns the episodes its own rows play
	for (let page = 1; page <= pageCount; page++) {
		const newsPage = await readNews({
			profileUserId: userIds.person,
			userId: userIds.person,
			window: "hour",
			page,
			cursor: firstPage?.cursor,
		})
		for (const podcastEpisode of newsPage?.podcastEpisodes ?? []) {
			podcastEpisodeIds.add(podcastEpisode.id)
		}
	}
	return podcastEpisodeIds
}

// a row's id as the news returns it
const toEventId = (kind: NewsEvent["kind"], name: string): string => `${kind}:${toRunId(name)}`

async function checkPersonNews(): Promise<void> {
	const week = await readEveryPage(userIds.person, "week")
	const weekIds = week.newsEvents.map((newsEvent) => newsEvent.id)
	const toPosition = (kind: NewsEvent["kind"], name: string): number => weekIds.indexOf(toEventId(kind, name))
	const hasRow = (kind: NewsEvent["kind"], name: string): boolean => toPosition(kind, name) >= 0

	// the pages: five rows each until the last, every row once, and the total on each
	check(
		"the week is read in pages of five",
		week.pageSizes.slice(0, -1).every((pageSize) => pageSize === NEWS_PAGE_SIZE),
		week.pageSizes,
	)
	check("the week's total counts every row", week.total === week.newsEvents.length, [week.total, weekIds.length])
	check("no row repeats across the pages", new Set(weekIds).size === weekIds.length)
	check("the week holds more than two pages", week.pageSizes.length >= 3, week.pageSizes)

	// the windows
	const day = await readEveryPage(userIds.person, "day")
	const hour = await readEveryPage(userIds.person, "hour")
	const dayIds = new Set(day.newsEvents.map((newsEvent) => newsEvent.id))
	check("the week holds the Podcast Episode of three days ago", hasRow("podcastEpisode", "old-episode"))
	check("the day leaves it out", !dayIds.has(toEventId("podcastEpisode", "old-episode")))
	check("the day holds the Comment of two hours ago", dayIds.has(toEventId("comment", "own-comment")))
	check(
		"the hour leaves the Comment of two hours ago out",
		!hour.newsEvents.some((newsEvent) => newsEvent.id === toEventId("comment", "own-comment")),
	)

	// the groups: own things, then the Teams' Topics, then the followed Topics
	check(
		"an older own Comment leads a newer followed Finding",
		toPosition("comment", "own-comment") < toPosition("finding", "followed-finding"),
	)
	check(
		"a Team's Topic comes between the own group and the followed one",
		toPosition("finding", "extra-finding-29") < toPosition("comment", "team-comment") &&
			toPosition("comment", "team-comment") < toPosition("finding", "followed-finding"),
	)
	check("a hidden membership's Team shows to the person", hasRow("finding", "hidden-team-finding"))
	check("a private Topic's Finding shows to its owner", hasRow("finding", "private-finding"))
	check(
		"a reply to the person's Comment is in the own group",
		hasRow("comment", "reply") && toPosition("comment", "reply") < toPosition("comment", "team-comment"),
	)

	// a tie, and a group's order
	check(
		"a Podcast Episode leads a Finding of the same time",
		toPosition("podcastEpisode", "tied-episode") + 1 === toPosition("finding", "tied-finding"),
	)
	const ownTimes = week.newsEvents
		.slice(0, toPosition("comment", "team-comment"))
		.map((newsEvent) => newsEvent.occurredAt)
	check("the own group reads newest first", ownTimes.join() === ownTimes.toSorted().toReversed().join())

	// the reactions
	const commentReactionRow = week.newsEvents.find(
		(newsEvent) => newsEvent.id === toEventId("reaction", "person-comment"),
	)
	check("the reactions on one Comment are one row", commentReactionRow !== undefined)
	check("its count leaves a blocked person's reaction out", commentReactionRow?.reactionCount === 2, commentReactionRow)
	check(
		"it is dated by the newest reaction the reader sees",
		commentReactionRow?.occurredAt === toMinutesAgo(10).toISOString(),
		commentReactionRow?.occurredAt,
	)
	check("it names the Comment's author", commentReactionRow?.commentAuthor?.userId === userIds.person)
	const findingReactionRows = week.newsEvents.filter(
		(newsEvent) => newsEvent.kind === "reaction" && newsEvent.path.includes(toRunId("followed-finding")),
	)
	check("two reactions on a Finding are two rows", findingReactionRows.length === 2, findingReactionRows)

	// what the Feed leaves out, and the user blocks
	check("a Finding rated thumbs down is absent", !hasRow("finding", "rated-down-finding"))
	check("its Comment is absent", !hasRow("comment", "rated-down-comment"))
	check(
		"its reaction is absent",
		!week.newsEvents.some((newsEvent) => newsEvent.path.includes(toRunId("rated-down-finding"))),
	)
	check("an invite Topic's Finding from before the activation is absent", !hasRow("finding", "early-invite-finding"))
	check("one from after the activation shows", hasRow("finding", "late-invite-finding"))
	check("a Comment by a person the reader blocked is absent", !hasRow("comment", "blocked-comment"))
	check("a Comment by a person who blocked the reader is absent", !hasRow("comment", "blocker-comment"))

	// the person's own Topic Posts
	const otherPostRow = week.newsEvents.find((newsEvent) => newsEvent.id === toEventId("topicPost", "other-post"))
	check("the person's Topic Post on a Topic they neither hold nor follow shows", otherPostRow !== undefined)
	check("its row names the post", otherPostRow?.topicPostId === toRunId("other-post"), otherPostRow?.topicPostId)
	check(
		"its row shows the post's own image",
		otherPostRow?.image?.thumbnail.url.includes(`/api/topic-post-images/${toRunId("other-post")}/posthash/`) === true,
		otherPostRow?.image,
	)
	check(
		"the person's Topic Post on a Topic they follow is in the own group, once",
		toPosition("topicPost", "followed-post") < toPosition("comment", "team-comment") &&
			weekIds.filter((weekId) => weekId === toEventId("topicPost", "followed-post")).length === 1,
	)
	check("the person's Topic Post on a Topic they may not open is absent", !hasRow("topicPost", "closed-post"))

	// a Comment's row
	const ownCommentRow = week.newsEvents.find((newsEvent) => newsEvent.id === toEventId("comment", "own-comment"))
	check("a Comment's row shows its first line", ownCommentRow?.text === "https://example.com first line", ownCommentRow)
	check(
		"a Comment's row opens the Comment on its page",
		ownCommentRow?.path === `/topics/${topicIds.ownPublic}/own-public?comment=${toRunId("own-comment")}`,
		ownCommentRow?.path,
	)
}

async function checkProfileNews(): Promise<void> {
	// a visitor and a signed-in stranger read the same public rows
	const visitorWeek = await readEveryPage(null, "week")
	const strangerWeek = await readEveryPage(userIds.stranger, "week")
	const visitorIds = new Set(visitorWeek.newsEvents.map((newsEvent) => newsEvent.id))
	check(
		"a stranger with a session reads what a visitor reads",
		visitorWeek.newsEvents.map((newsEvent) => newsEvent.id).join() ===
			strangerWeek.newsEvents.map((newsEvent) => newsEvent.id).join(),
	)

	// the public own group and the shown Team, and nothing else
	check("a visitor reads the public Topic's Comment", visitorIds.has(toEventId("comment", "own-comment")))
	check("a visitor reads the shown Team's Comment", visitorIds.has(toEventId("comment", "team-comment")))
	check("a private Topic's Finding is absent", !visitorIds.has(toEventId("finding", "private-finding")))
	check("a hidden membership's Team is absent", !visitorIds.has(toEventId("finding", "hidden-team-finding")))
	check("a followed Topic's Finding is absent", !visitorIds.has(toEventId("finding", "followed-finding")))
	check("the person's Topic Post on a public Topic shows", visitorIds.has(toEventId("topicPost", "other-post")))
	check("the person's Topic Post on a private Topic is absent", !visitorIds.has(toEventId("topicPost", "closed-post")))
	check(
		"the reactions on the person's Comment on a public Topic show, with every reaction counted",
		visitorWeek.newsEvents.find((newsEvent) => newsEvent.id === toEventId("reaction", "person-comment"))
			?.reactionCount === 3,
	)

	// a page past the first read with no cursor returns the same rows as one read with the first page's cursor
	const visitorRead = { profileUserId: userIds.person, userId: null }
	const weekPage = await readNews({ ...visitorRead, window: "week", page: 1 })
	const secondPage = await readNews({ ...visitorRead, window: "week", page: 2, cursor: weekPage?.cursor })
	const secondPageWithNoCursor = await readNews({ ...visitorRead, window: "week", page: 2 })
	check(
		"a second page reads the same rows with or without the first page's cursor",
		secondPage?.newsEvents.map((newsEvent) => newsEvent.id).join() ===
			secondPageWithNoCursor?.newsEvents.map((newsEvent) => newsEvent.id).join() &&
			(secondPage?.newsEvents.length ?? 0) === NEWS_PAGE_SIZE,
	)

	// a cursor of another window is rejected
	const dayPage = await readNews({ ...visitorRead, window: "day", page: 1, cursor: weekPage?.cursor ?? "" })
	check("a cursor of another window is rejected", dayPage === null)

	// the play buttons: the tied Podcast Episode's row returns its own episode
	const personWeek = await readEveryPodcastEpisodeId()
	check("a Podcast Episode's row returns the episode it plays", personWeek.has(toRunId("tied-episode")))
}

// seed, run every check, and clean up whatever happened
try {
	// the rows every check reads
	await seedPeopleAndTopics()
	await seedOwnEvents()
	await seedPersonTopicPosts()
	await seedTeamAndFollowedEvents()
	await checkPersonNews()
	await checkProfileNews()
} finally {
	// undo the run's rows whether a check threw or not
	await cleanUp()
	await connectionPool.end()
}
console.log(failureCount === 0 ? "news smoke passed" : `news smoke failed: ${failureCount}`)
process.exit(failureCount === 0 ? 0 : 1)
