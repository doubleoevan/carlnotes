// a live smoke test for the podcast episode routes, covering who may listen, the audio, a listener's progress,
// the next unplayed episode, the podcast switch, the feeds, the episode pages, the covers, and removal.
// run it with: doppler run -- bun api/podcast/podcastEpisodes.smoke.ts. needs Doppler secrets and no model
import { eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { connectionPool, db } from "../../db"
import { deletePodcastFeedCache, toPodcastFeedCacheKey } from "../../db/podcastFeedCache"
import { readRedisJson } from "../../db/redis"
import {
	favicons,
	findings,
	podcastEpisodeChapters,
	podcastEpisodeListens,
	podcastEpisodes,
	resources,
	scans,
	subscriptions,
	topics,
	users,
} from "../../db/schema"
import type { SessionUser } from "../auth"
import type { AppEnv } from "../currentUser"
import { documentsRoute } from "../documents"
import { toSitemapXml } from "../seo"
import { updateTopicFields } from "../tool/topicTools"
import { loadTopicGateResponse } from "../topic/helpers"
import { setTopicSubscription } from "../topic/subscriptions"
import { loadTopicPage } from "../topic/topics"
import { podcastEpisodesRoute } from "./podcastEpisodes"
import { podcastFeedsRoute } from "./podcastFeeds"

// the smoke runs with podcast episodes on, no matter what the environment says
Bun.env.PODCAST_SPEECH_MODEL ||= "smoke-speech-model"

// one id per run, and every fixture id derives from it. two runs at once never collide
const runId = `episodes-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
const ownerId = `${runId}-owner`
const paidOwnerId = `${runId}-paid-owner`
const subscriberId = `${runId}-subscriber`

// the host of the chapter's source, which has a stored favicon
const chapterSourceHost = `${runId}.example`

// the public, invite, paid, and private topics
const publicTopicId = `${runId}-public`
const inviteTopicId = `${runId}-invite`
const paidTopicId = `${runId}-paid`
const privateTopicId = `${runId}-private`

// the public, invite, and private topics' podcast episodes, and the chapter's resource and finding
const publicPodcastEpisodeId = `${runId}-public-episode`
const invitePodcastEpisodeId = `${runId}-invite-episode`
const privatePodcastEpisodeId = `${runId}-private-episode`
const resourceId = `${runId}-resource`
const findingId = `${runId}-finding`

// the routes and the feed documents under a middleware that reads the user from a header, in place of the session
const app = new Hono<AppEnv>()
	.use("*", async (context, next) => {
		const userId = context.req.header("x-smoke-user")
		context.set("user", userId ? ({ id: userId } as SessionUser) : null)
		await next()
	})
	// the podcast episode routes, the feed and cover routes, and the feed documents
	.route("/", podcastEpisodesRoute)
	.route("/", podcastFeedsRoute)
	.route("/", documentsRoute)

// each check reports its own line, and one failure fails the run
let failureCount = 0
function check(label: string, isTestPassing: boolean, detail?: unknown): void {
	// print one line for a pass, and the detail for a failure
	if (isTestPassing) {
		console.log(`  ok  ${label}`)
		return
	}
	failureCount += 1
	console.error(`FAIL  ${label}`, detail ?? "")
}

// a request's path, the user to send it as or null for a visitor, and its method, headers, and body
type RequestOptions = { path: string; userId: string | null; init?: RequestInit }

// send one request as the given user, or as a visitor
function request({ path, userId, init = {} }: RequestOptions): Promise<Response> {
	const userHeaders: Record<string, string> = userId ? { "x-smoke-user": userId } : {}
	return Promise.resolve(app.request(path, { ...init, headers: { ...userHeaders, ...init.headers } }))
}

// a JSON request's path, its user, its method, and its body
type SendJsonOptions = { path: string; userId: string | null; method: string; body: unknown }

// send a JSON body as the given user
function sendJson({ path, userId, method, body }: SendJsonOptions): Promise<Response> {
	const init = { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
	return request({ path, userId, init })
}

// one account, named by its own id
function toUserRow(id: string, plan: "free" | "plus" = "free"): typeof users.$inferInsert {
	return { id, name: id, email: `${id}@example.com`, username: id, usernameNormalized: id, plan }
}

// the id, the topic, and the topic's owner of one podcast episode to seed
type ToPodcastEpisodeRowOptions = { id: string; topicId: string; topicOwnerId: string }

// one published podcast episode of a topic, an hour old, with its scan's id
function toPodcastEpisodeRow({
	id,
	topicId,
	topicOwnerId,
}: ToPodcastEpisodeRowOptions): typeof podcastEpisodes.$inferInsert {
	return {
		id,
		topicId,
		ownerId: topicOwnerId,
		scanId: `${id}-scan`,
		status: "published",
		title: "A quieter grinder",
		description: "A quieter burr set.",
		season: 2026,
		episodeNumber: 1,
		audioKey: `episodes/${id}/audio.mp3`,
		audioByteSize: 123_456,
		durationSeconds: 120,
		cost: "0.050000",
		publishedAt: new Date(Date.now() - 60 * 60 * 1000),
	}
}

// a free owner with a public and an invite topic, a paid owner with a topic and a private topic,
// a subscriber who joined the invite topic just now,
// and one published podcast episode on the public, the invite, and the private topic
async function seed(): Promise<void> {
	await db.insert(users).values([toUserRow(ownerId), toUserRow(paidOwnerId, "plus"), toUserRow(subscriberId)])
	await db.insert(topics).values([
		{ id: publicTopicId, ownerId, name: `${runId} public`, visibility: "public" },
		{ id: inviteTopicId, ownerId, name: `${runId} invite`, visibility: "invite" },
		{
			id: paidTopicId,
			ownerId: paidOwnerId,
			name: `${runId} paid`,
			visibility: "private",
			isPodcastEnabled: false,
		},
		{ id: privateTopicId, ownerId: paidOwnerId, name: `${runId} private`, visibility: "private" },
	])
	await db.insert(scans).values([
		{ id: `${publicPodcastEpisodeId}-scan`, topicId: publicTopicId, ownerId, status: "succeeded" },
		{ id: `${invitePodcastEpisodeId}-scan`, topicId: inviteTopicId, ownerId, status: "succeeded" },
		{ id: `${privatePodcastEpisodeId}-scan`, topicId: privateTopicId, ownerId: paidOwnerId, status: "succeeded" },
	])

	// the podcast episodes, with one chapter on the public topic's episode that narrates one finding
	await db
		.insert(podcastEpisodes)
		.values([
			toPodcastEpisodeRow({ id: publicPodcastEpisodeId, topicId: publicTopicId, topicOwnerId: ownerId }),
			toPodcastEpisodeRow({ id: invitePodcastEpisodeId, topicId: inviteTopicId, topicOwnerId: ownerId }),
			toPodcastEpisodeRow({ id: privatePodcastEpisodeId, topicId: privateTopicId, topicOwnerId: paidOwnerId }),
		])
	await db.insert(resources).values({ id: resourceId, url: `https://episodes-smoke.example/${runId}`, kind: "read" })
	const findingTopicAndScanIds = { topicId: publicTopicId, scanId: `${publicPodcastEpisodeId}-scan` }
	await db.insert(findings).values({ id: findingId, resourceId, relevanceScore: 0.9, ...findingTopicAndScanIds })
	const chapterTimes = { startSeconds: 0, endSeconds: 120 }
	await db.insert(podcastEpisodeChapters).values({
		podcastEpisodeId: publicPodcastEpisodeId,
		position: 0,
		findingId,
		resourceId,
		title: "The grinder",
		sourceUrl: `https://${chapterSourceHost}/grinder`,
		...chapterTimes,
	})
	await db.insert(favicons).values({ host: chapterSourceHost, objectKey: `favicons/${runId}` })

	// the subscriber holds a subscription to both topics and joined after the invite topic's podcast episode published
	await db.insert(subscriptions).values([
		{ topicId: publicTopicId, subscriberUserId: subscriberId },
		{ topicId: inviteTopicId, subscriberUserId: subscriberId },
	])
}

// delete the fixtures. the users' delete cascades to their topics, scans, podcast episodes, and subscriptions.
// the resource and the favicon belong to no user
async function cleanUp(): Promise<void> {
	await db.delete(users).where(inArray(users.id, [ownerId, paidOwnerId, subscriberId]))
	await db.delete(resources).where(eq(resources.id, resourceId))
	await db.delete(favicons).where(eq(favicons.host, chapterSourceHost))
}

try {
	await seed()

	// who may listen to a podcast episode
	const ownerPodcastEpisode = await (
		await request({ path: `/episodes/${publicPodcastEpisodeId}`, userId: ownerId })
	).json()
	check("the owner reads the episode with its chapter", ownerPodcastEpisode.chapters?.length === 1, ownerPodcastEpisode)
	check(
		"a visitor reads a public topic's episode",
		(await request({ path: `/episodes/${publicPodcastEpisodeId}`, userId: null })).status === 200,
	)
	check(
		"a visitor cannot read an invite topic's episode",
		(await request({ path: `/episodes/${invitePodcastEpisodeId}`, userId: null })).status === 404,
	)

	// the subscriber joined after the invite topic's podcast episode published, and the owner may listen to every episode
	const lateSubscriberResponse = await request({ path: `/episodes/${invitePodcastEpisodeId}`, userId: subscriberId })
	check("a subscriber cannot read an episode from before they joined", lateSubscriberResponse.status === 404)
	check(
		"an invite topic's episode page stays closed to a subscriber who joined after the episode published",
		(await request({ path: `/topics/${inviteTopicId}/episodes/2026/1`, userId: subscriberId })).status === 404,
	)
	const subscriberSeasonPodcastEpisodes = await (
		await request({ path: `/topics/${inviteTopicId}/episodes?season=2026`, userId: subscriberId })
	).json()
	check(
		"that subscriber's episode list is empty",
		subscriberSeasonPodcastEpisodes.podcastEpisodes?.length === 0,
		subscriberSeasonPodcastEpisodes,
	)
	const ownerSeasonPodcastEpisodes = await (
		await request({ path: `/topics/${inviteTopicId}/episodes?season=2026`, userId: ownerId })
	).json()
	check(
		"the owner's list has the episode",
		ownerSeasonPodcastEpisodes.podcastEpisodes?.length === 1,
		ownerSeasonPodcastEpisodes,
	)

	// the topic page's podcast and its scan history
	const topicPage = await loadTopicPage(ownerId, publicTopicId)
	check("the topic page has the latest episode", topicPage?.latestPodcastEpisode?.id === publicPodcastEpisodeId)
	check(
		"the latest episode links to its own page",
		topicPage?.latestPodcastEpisode?.pagePath?.startsWith(`/topics/${publicTopicId}/`) === true &&
			topicPage.latestPodcastEpisode.pagePath.includes("/episodes/"),
		topicPage?.latestPodcastEpisode?.pagePath,
	)
	check(
		"the topic page has the newest episodes of the newest season",
		topicPage?.podcast?.latestSeasonPodcastEpisodes.podcastEpisodes[0]?.id === publicPodcastEpisodeId,
	)
	check("a free topic gets short episodes", topicPage?.podcast?.hasFullPodcastEpisodes === false)
	check(
		"the scan history row names its episode",
		topicPage?.scans[0]?.podcastEpisode?.episodeNumber === 1,
		topicPage?.scans,
	)
	check("a public topic with an episode has a public feed", Boolean(topicPage?.podcast?.publicFeedUrl))
	check(
		"a topic whose newest episode published has no unpublished episode",
		topicPage?.podcast?.unpublishedPodcastEpisode === null,
	)

	// a podcast episode that is recording shows on the topic page until it leaves that state
	const recordingPodcastEpisodeId = `${runId}-recording-episode`
	await db
		.insert(podcastEpisodes)
		.values({ id: recordingPodcastEpisodeId, topicId: publicTopicId, ownerId, title: "Still recording" })
	const recordingTopicPage = await loadTopicPage(ownerId, publicTopicId)
	check(
		"the topic page has the episode that is recording",
		recordingTopicPage?.podcast?.unpublishedPodcastEpisode?.id === recordingPodcastEpisodeId &&
			recordingTopicPage.latestPodcastEpisode?.id === publicPodcastEpisodeId,
	)

	// the same podcast episode still shows once its recording fails
	await db.update(podcastEpisodes).set({ status: "failed" }).where(eq(podcastEpisodes.id, recordingPodcastEpisodeId))
	const failedTopicPage = await loadTopicPage(ownerId, publicTopicId)
	check(
		"the topic page has the episode that failed to record",
		failedTopicPage?.podcast?.unpublishedPodcastEpisode?.status === "failed",
	)
	await db.delete(podcastEpisodes).where(eq(podcastEpisodes.id, recordingPodcastEpisodeId))

	// a HEAD of the audio gets the file's length, and a GET redirects
	const audioPath = `/episodes/${publicPodcastEpisodeId}/audio.mp3`
	const headResponse = await request({ path: audioPath, userId: ownerId, init: { method: "HEAD" } })
	const hasHeadFileLength = headResponse.status === 200 && headResponse.headers.get("Content-Length") === "123456"
	check(
		"a HEAD has the file's length and accepts ranges",
		hasHeadFileLength && headResponse.headers.get("Accept-Ranges") === "bytes",
	)
	const getResponse = await request({ path: audioPath, userId: null })
	const isGetRedirected =
		getResponse.status === 302 && Boolean(getResponse.headers.get("Location")?.includes(publicPodcastEpisodeId))
	check(
		"a GET redirects to a presigned url, uncached",
		isGetRedirected && getResponse.headers.get("Cache-Control") === "private, no-store",
	)
	check(
		"an invite topic's audio is missing for a visitor",
		(await request({ path: `/episodes/${invitePodcastEpisodeId}/audio.mp3`, userId: null })).status === 404,
	)

	// the next unplayed podcast episode, then a listener's progress
	const nextUnplayedBeforeListen = await (
		await request({ path: `/episodes/next-unplayed?topicId=${inviteTopicId}`, userId: ownerId })
	).json()
	check(
		"the next unplayed episode is the other topic's",
		nextUnplayedBeforeListen.podcastEpisode?.id === publicPodcastEpisodeId,
		nextUnplayedBeforeListen,
	)
	const listenPath = `/episodes/${publicPodcastEpisodeId}/listen`
	check(
		"a visitor's listening is not saved",
		(await sendJson({ path: listenPath, userId: null, method: "POST", body: { progressSeconds: 5 } })).status === 401,
	)
	await sendJson({
		path: listenPath,
		userId: ownerId,
		method: "POST",
		body: { progressSeconds: 30, isPlaybackStart: true, isCompleted: true },
	})
	await sendJson({
		path: listenPath,
		userId: ownerId,
		method: "POST",
		body: { progressSeconds: 45, isPlaybackStart: true },
	})

	// the owner's listen row after both reports
	const [podcastEpisodeListenRow] = await db
		.select()
		.from(podcastEpisodeListens)
		.where(eq(podcastEpisodeListens.podcastEpisodeId, publicPodcastEpisodeId))
	const isProgressSaved = podcastEpisodeListenRow?.progressSeconds === 45 && podcastEpisodeListenRow.playCount === 2
	check(
		"two starts are two plays on one row, and a finish stays",
		isProgressSaved && podcastEpisodeListenRow?.completedAt !== null,
		podcastEpisodeListenRow,
	)
	const nextUnplayedAfterListen = await (
		await request({ path: `/episodes/next-unplayed?topicId=${inviteTopicId}`, userId: ownerId })
	).json()
	check("a played episode is not next", nextUnplayedAfterListen.podcastEpisode === null, nextUnplayedAfterListen)

	// the owner's switch, through the settings tool
	const podcastPath = `/topics/${publicTopicId}/podcast`
	check(
		"a subscriber cannot change the switch",
		(await sendJson({ path: podcastPath, userId: subscriberId, method: "PUT", body: { isPodcastEnabled: false } }))
			.status === 403,
	)
	check(
		"the owner turns the podcast off",
		(await sendJson({ path: podcastPath, userId: ownerId, method: "PUT", body: { isPodcastEnabled: false } }))
			.status === 200,
	)
	const podcastOnResponse = await sendJson({
		path: podcastPath,
		userId: ownerId,
		method: "PUT",
		body: { isPodcastEnabled: true },
	})
	check(
		"a free topic that has an episode turns its podcast back on",
		podcastOnResponse.status === 200,
		await podcastOnResponse.json(),
	)
	const updateTopicFieldsResult = await updateTopicFields({
		userId: paidOwnerId,
		topicId: paidTopicId,
		topicFields: { isPodcastEnabled: true },
		promptVersionOrigin: "chat",
	})
	const [paidTopic] = await db.select().from(topics).where(eq(topics.id, paidTopicId))
	check(
		"a paid owner turns the podcast on through the settings tool",
		updateTopicFieldsResult.status === "saved" && paidTopic?.isPodcastEnabled === true,
	)

	// the public feed, and the 304 that a current copy gets
	const publicFeedResponse = await request({ path: `/topics/${publicTopicId}/podcast.xml`, userId: null })
	const publicFeedXml = await publicFeedResponse.text()
	check(
		"a public topic's feed lists its episode",
		publicFeedResponse.status === 200 && publicFeedXml.includes(publicPodcastEpisodeId),
	)
	const feedEtag = publicFeedResponse.headers.get("ETag") ?? ""
	const currentFeedResponse = await request({
		path: `/topics/${publicTopicId}/podcast.xml`,
		userId: null,
		init: { headers: { "If-None-Match": feedEtag } },
	})
	check("an unchanged feed is a 304", currentFeedResponse.status === 304)
	check(
		"an invite topic has no public feed",
		(await request({ path: `/topics/${inviteTopicId}/podcast.xml`, userId: null })).status === 404,
	)

	// a feed within the limit is cached in Redis. a feed past the limit lists every podcast episode and is not cached
	const podcastFeedCacheKey = toPodcastFeedCacheKey({ topicId: publicTopicId, listenerUserId: null })
	check("a short feed is cached in Redis", (await readRedisJson(podcastFeedCacheKey)) !== null)
	const olderPodcastEpisodeRows = await db
		.insert(podcastEpisodes)
		.values(
			Array.from({ length: 100 }, (_, i) => ({
				topicId: publicTopicId,
				ownerId,
				model: "smoke-speech-model",
				status: "published" as const,
				title: `Older episode ${i + 1}`,
				season: 2025,
				episodeNumber: i + 1,
				durationSeconds: 60,
				publishedAt: new Date(Date.UTC(2025, 0, i + 1)),
			})),
		)
		.returning({ id: podcastEpisodes.id })
	await deletePodcastFeedCache(publicTopicId)
	const longFeedXml = await (await request({ path: `/topics/${publicTopicId}/podcast.xml`, userId: null })).text()
	check("a feed of 101 episodes lists every one", longFeedXml.split("<item>").length - 1 === 101)
	check("a feed past 100 episodes is not cached in Redis", (await readRedisJson(podcastFeedCacheKey)) === null)

	// delete the older podcast episodes again, so the checks below see the topic's one episode
	const olderPodcastEpisodeIds = olderPodcastEpisodeRows.map((olderPodcastEpisodeRow) => olderPodcastEpisodeRow.id)
	await db.delete(podcastEpisodes).where(inArray(podcastEpisodes.id, olderPodcastEpisodeIds))
	await deletePodcastFeedCache(publicTopicId)

	// the public topic's feed url, then the owner's own feed url of the invite topic
	const publicTopicFeedUrl = (
		await (await request({ path: `/topics/${publicTopicId}/podcast-feed`, userId: subscriberId })).json()
	).podcastFeedUrl
	check(
		"a public topic's feed url is the public one",
		publicTopicFeedUrl?.endsWith(`/topics/${publicTopicId}/podcast.xml`),
	)
	const ownerFeedUrl: string = (
		await (await request({ path: `/topics/${inviteTopicId}/podcast-feed`, userId: ownerId })).json()
	).podcastFeedUrl

	// the owner's feed at a path after the owner's feed token, read with no session
	const ownerFeedPath = new URL(ownerFeedUrl).pathname
	const ownerFeedToken = ownerFeedPath.replace("/podcast-feeds/", "").replace(".xml", "")
	const ownerFeedResponse = await request({ path: ownerFeedPath, userId: null })
	const ownerFeedXml = await ownerFeedResponse.text()
	const isOwnerFeedPrivate =
		ownerFeedResponse.headers.get("X-Robots-Tag") === "noindex" && ownerFeedXml.includes("<itunes:block>Yes")
	check(
		"the owner's own feed lists the episode",
		ownerFeedXml.includes(`/podcast-feeds/${ownerFeedToken}/episodes/${invitePodcastEpisodeId}/audio.mp3`),
	)
	check(
		"a listener's own feed is blocked, unindexed, and uncached",
		isOwnerFeedPrivate && ownerFeedResponse.headers.get("Cache-Control") === "private, no-store",
	)

	// the token's audio counts as the listener's play, and the token opens no other topic's podcast episode
	const tokenAudioPath = `/podcast-feeds/${ownerFeedToken}/episodes/${invitePodcastEpisodeId}/audio.mp3`
	check(
		"a token's audio HEAD gets a 200",
		(await request({ path: tokenAudioPath, userId: null, init: { method: "HEAD" } })).status === 200,
	)
	check("a token's audio GET redirects", (await request({ path: tokenAudioPath, userId: null })).status === 302)
	const [tokenListenRow] = await db
		.select()
		.from(podcastEpisodeListens)
		.where(eq(podcastEpisodeListens.podcastEpisodeId, invitePodcastEpisodeId))
	check(
		"the download is that listener's play",
		tokenListenRow?.userId === ownerId && tokenListenRow.playCount === 1,
		tokenListenRow,
	)
	const otherTopicPath = `/podcast-feeds/${ownerFeedToken}/episodes/${publicPodcastEpisodeId}/audio.mp3`
	check(
		"a token never opens another topic's episode",
		(await request({ path: otherTopicPath, userId: null })).status === 404,
	)
	check(
		"a made-up token has no feed",
		(await request({ path: "/podcast-feeds/made-up-token.xml", userId: null })).status === 404,
	)

	// a subscriber who joined after the podcast episode gets an empty feed
	const subscriberFeedUrl: string = (
		await (await request({ path: `/topics/${inviteTopicId}/podcast-feed`, userId: subscriberId })).json()
	).podcastFeedUrl
	const subscriberFeedPath = new URL(subscriberFeedUrl).pathname
	const subscriberFeedXml = await (await request({ path: subscriberFeedPath, userId: null })).text()
	check("a late subscriber's feed lists no episode from before they joined", !subscriberFeedXml.includes("<item>"))

	// a reset gives a new url and ends the old url
	const resetFeedUrl: string = (
		await (
			await request({
				path: `/topics/${inviteTopicId}/podcast-feed/reset`,
				userId: subscriberId,
				init: { method: "POST" },
			})
		).json()
	).podcastFeedUrl
	check(
		"a reset ends the old url",
		(await request({ path: subscriberFeedPath, userId: null })).status === 404 && resetFeedUrl !== subscriberFeedUrl,
	)
	check("the new url works", (await request({ path: new URL(resetFeedUrl).pathname, userId: null })).status === 200)

	// unsubscribing deletes the token
	await setTopicSubscription(subscriberId, inviteTopicId, false)
	check(
		"unsubscribing deletes the token",
		(await request({ path: new URL(resetFeedUrl).pathname, userId: null })).status === 404,
	)

	// an invite topic's podcast episode page shows a visitor the topic's gate, and the sitemap never lists the episode.
	// the topic's owner still opens the page
	check(
		"the sitemap lists nothing of the invite topic",
		!(await toSitemapXml("https://carlnotes.example.com")).includes(inviteTopicId),
	)
	const invitePodcastEpisodePath = `/topics/${inviteTopicId}/episodes/2026/1`
	const visitorInvitePodcastEpisodeResponse = await request({ path: invitePodcastEpisodePath, userId: null })
	const visitorInvitePodcastEpisodeBody = await visitorInvitePodcastEpisodeResponse.json()
	check(
		"an invite topic's episode page is gated for a visitor, naming the topic",
		visitorInvitePodcastEpisodeResponse.status === 403 &&
			visitorInvitePodcastEpisodeBody.gatedVisibility === "invite" &&
			typeof visitorInvitePodcastEpisodeBody.topicName === "string",
		visitorInvitePodcastEpisodeBody,
	)
	const ownerInvitePodcastEpisodePage = await (
		await request({ path: invitePodcastEpisodePath, userId: ownerId })
	).json()
	check(
		"an invite topic's episode page opens for its owner and names the topic's visibility",
		ownerInvitePodcastEpisodePage.podcastEpisode?.id === invitePodcastEpisodeId &&
			ownerInvitePodcastEpisodePage.topic?.visibility === "invite",
	)

	// a private topic's podcast episode page shows a visitor and a signed-in non-member the topic's gate without its name.
	// the topic's owner still opens the page, and the sitemap never lists the episode
	const privatePodcastEpisodePath = `/topics/${privateTopicId}/episodes/2026/1`
	const gatedUsers = [
		{ gatedUserLabel: "a visitor", gatedUserId: null },
		{ gatedUserLabel: "a signed-in non-member", gatedUserId: subscriberId },
	]
	for (const { gatedUserLabel, gatedUserId } of gatedUsers) {
		// the gate that the user gets, with no name in it
		const privateGateResponse = await request({ path: privatePodcastEpisodePath, userId: gatedUserId })
		const privateGateBody = await privateGateResponse.json()
		check(
			`a private topic's episode page is gated for ${gatedUserLabel}, without the topic's name`,
			privateGateResponse.status === 403 &&
				privateGateBody.gatedVisibility === "private" &&
				privateGateBody.topicName === null,
			privateGateBody,
		)
	}
	check(
		"a private topic's episode page opens for its owner",
		(await request({ path: privatePodcastEpisodePath, userId: paidOwnerId })).status === 200,
	)
	check(
		"the sitemap lists nothing of the private topic",
		!(await toSitemapXml("https://carlnotes.example.com")).includes(privateTopicId),
	)

	// the topic page's gate names only an invite topic, and a public topic has no gate
	const privateTopicGateResponse = await loadTopicGateResponse(privateTopicId)
	check(
		"a private topic's gate has no name",
		privateTopicGateResponse?.gatedVisibility === "private" && privateTopicGateResponse.topicName === null,
		privateTopicGateResponse,
	)
	const inviteTopicGateResponse = await loadTopicGateResponse(inviteTopicId)
	check(
		"an invite topic's gate names the topic",
		inviteTopicGateResponse?.gatedVisibility === "invite" && inviteTopicGateResponse.topicName === `${runId} invite`,
		inviteTopicGateResponse,
	)
	check("a public topic has no gate", (await loadTopicGateResponse(publicTopicId)) === null)

	// a private topic's podcast episode has its link-preview card, served without a session
	const privatePreviewResponse = await request({
		path: `/episodes/${privatePodcastEpisodeId}/preview.png`,
		userId: null,
	})
	check(
		"a private topic's episode card loads without a session",
		privatePreviewResponse.status === 200 && privatePreviewResponse.headers.get("Content-Type") === "image/png",
	)
	const publicPodcastEpisodePage = await (
		await request({ path: `/topics/${publicTopicId}/episodes/2026/1`, userId: null })
	).json()
	check(
		"a public topic's episode page has the episode and its topic",
		publicPodcastEpisodePage.podcastEpisode?.id === publicPodcastEpisodeId &&
			publicPodcastEpisodePage.topic?.id === publicTopicId,
	)
	check(
		"the episode page's byline credits the topic's owner",
		publicPodcastEpisodePage.topic?.owner?.userId === ownerId && publicPodcastEpisodePage.topic?.teamLink === null,
	)
	check(
		"the episode page's chapter names its source's stored favicon",
		publicPodcastEpisodePage.podcastEpisode?.chapters[0]?.faviconPath === `/api/favicons/${chapterSourceHost}`,
	)
	check(
		"the episode page has the finding that its chapter narrates, which a visitor may not rate",
		publicPodcastEpisodePage.topicFindings?.[0]?.findingId === findingId && publicPodcastEpisodePage.canRate === false,
	)

	// a cover's url works without a session, and a made-up key is missing
	const coverPath: string = ownerPodcastEpisode.smallCoverUrl.replace("/api", "")
	const madeUpCoverPath = coverPath.replace(/[0-9a-f]{32}/, "0".repeat(32))
	check("a made-up cover key is missing", (await request({ path: madeUpCoverPath, userId: null })).status === 404)
	const coverResponse = await request({ path: coverPath, userId: null })
	check(
		"a cover loads without a session",
		coverResponse.status === 200 && coverResponse.headers.get("Content-Type") === "image/jpeg",
	)

	// removing a podcast episode
	const podcastEpisodePath = `/episodes/${publicPodcastEpisodeId}`
	check(
		"a subscriber cannot remove an episode",
		(await request({ path: podcastEpisodePath, userId: subscriberId, init: { method: "DELETE" } })).status === 404,
	)
	check(
		"the owner removes it",
		(await request({ path: podcastEpisodePath, userId: ownerId, init: { method: "DELETE" } })).status === 200,
	)
	const [removedPodcastEpisodeRow] = await db
		.select()
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, publicPodcastEpisodeId))
	check(
		"the row stays as removed with its episode number",
		removedPodcastEpisodeRow?.status === "removed" && removedPodcastEpisodeRow.episodeNumber === 1,
	)
	check("a removed episode is missing", (await request({ path: podcastEpisodePath, userId: ownerId })).status === 404)
	check("its audio url is missing", (await request({ path: audioPath, userId: ownerId })).status === 404)
	check(
		"the topic's public feed is gone with its only episode",
		(await request({ path: `/topics/${publicTopicId}/podcast.xml`, userId: null })).status === 404,
	)
} finally {
	// delete the fixtures no matter what happened, then close the connection pool.
	// an open connection pool keeps the process alive
	await cleanUp()
	await connectionPool.end()
}

// one failure fails the run
if (failureCount > 0) {
	console.error(`${failureCount} check(s) failed`)
	process.exit(1)
}
console.log("episodes smoke passed")
