// a live smoke test for the news read against the dev database: the windows, the three groups and their order, ties,
// the reactions on one Comment as one row, a Finding rated thumbs down, an invite Topic's activation, the user blocks
// in both directions, the person's own Topic Posts, someone else's profile, an admin's read and audiences, and the pages.
// the profile's Team Topics share the news's membership rule, so a profile check runs on the same rows
// run it with: bun run smoke:news. needs Doppler secrets

import { NEWS_PAGE_SIZE, type NewsEvent, type NewsWindow } from "@carlnotes/contracts/news"

// the run's connection pool
const { connectionPool } = await import("@carlnotes/db")

// the seeded rows and their ids
const {
	cleanUp,
	seedOwnEvents,
	seedPeopleAndTopics,
	seedPersonTopicPosts,
	seedTeamAndFollowedEvents,
	toMinutesAgo,
	toRunId,
	topicIds,
	userIds,
} = await import("./newsSmokeFixtures")

// the reads under test
const { readNews } = await import("./readNews")
const { loadProfileTopicRows } = await import("../profileCards")
const { profilesRoute } = await import("../profiles")
const { Hono } = await import("hono")

// each check's result, counted for the exit code
let failureCount = 0
function check(label: string, isTestPassing: boolean, detail?: unknown): void {
	console.log(`${isTestPassing ? "ok  " : "FAIL"} ${label}`, isTestPassing || detail === undefined ? "" : detail)
	failureCount += isTestPassing ? 0 : 1
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

	// an admin reads the person's whole news, as the person reads it
	const toWeekIds = async (userId: string): Promise<string> =>
		(await readEveryPage(userId, "week")).newsEvents.map((newsEvent) => newsEvent.id).join()
	check(
		"an admin reads the person's whole news",
		(await toWeekIds(userIds.admin)) === (await toWeekIds(userIds.person)),
	)
}

async function checkProfileTeamTopics(): Promise<void> {
	// the profile's Topics as a visitor and as the person read them
	const toProfileTopicIdSet = async (profileReader: "person" | "visitor"): Promise<Set<string>> =>
		new Set((await loadProfileTopicRows({ profileUserId: userIds.person, profileReader })).map((topic) => topic.id))
	const visitorProfileTopicIds = await toProfileTopicIdSet("visitor")
	const personProfileTopicIds = await toProfileTopicIdSet("person")
	check("a visitor's profile holds the shown Team's Topic", visitorProfileTopicIds.has(topicIds.team))
	check("a visitor's profile leaves out the hidden membership's Team", !visitorProfileTopicIds.has(topicIds.hiddenTeam))
	check("the person's profile holds the hidden membership's Team", personProfileTopicIds.has(topicIds.hiddenTeam))
}

async function checkAdminProfileAudiences(): Promise<void> {
	// the profile route with the admin signed in, as the api's session middleware signs a user in
	const adminApp = new Hono()
		.use(async (context, next) => {
			context.set("user" as never, { id: userIds.admin } as never)
			await next()
		})
		.route("/", profilesRoute)

	// the profile's flag and its table's Topic ids from a audience
	const toProfileTopicIds = async (
		query: string,
	): Promise<{ includesNonPublicTopics: boolean; topicIds: string[] }> => {
		const profile = await (await adminApp.request(`/profiles/${userIds.person}${query}`)).json()
		return { ...profile, topicIds: profile.topics.map((topic: { id: string }) => topic.id) }
	}

	// the user audience shows the admin the person's private Topic, and the visitor audience reads as a visitor
	const userAudience = await toProfileTopicIds("")
	const visitorAudience = await toProfileTopicIds("?audience=visitor")
	check(
		"an admin's user audience reads the person's private Topic",
		userAudience.topicIds.includes(topicIds.ownPrivate),
	)
	check(
		"an admin's visitor audience leaves the private Topic out",
		!visitorAudience.topicIds.includes(topicIds.ownPrivate),
	)
	check("an admin's visitor audience reads no non-public Topic", !visitorAudience.includesNonPublicTopics)
}

// seed, run every check, and clean up whatever happened
try {
	// the rows every check reads
	await seedPeopleAndTopics()
	await seedOwnEvents()
	await seedPersonTopicPosts()
	await seedTeamAndFollowedEvents()

	// the news, the profile, and an admin's two audiences of a profile
	await checkPersonNews()
	await checkProfileNews()
	await checkProfileTeamTopics()
	await checkAdminProfileAudiences()
} finally {
	// undo the run's rows whether a check threw or not
	await cleanUp()
	await connectionPool.end()
}
console.log(failureCount === 0 ? "news smoke passed" : `news smoke failed: ${failureCount}`)
process.exit(failureCount === 0 ? 0 : 1)
