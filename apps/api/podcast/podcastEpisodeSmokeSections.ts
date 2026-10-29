// the podcast episode smoke sections: who may listen, the topic page's podcast, the audio, a listener's progress,
// the podcast switch, the covers, and removal

import { db } from "@carlnotes/db"
import { podcastEpisodeListens, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { eq } from "drizzle-orm"
import { updateTopicFields } from "../tool/topicTools"
import { loadTopicPage } from "../topic/topics"
import {
	check,
	invitePodcastEpisodeId,
	inviteTopicId,
	ownerId,
	paidOwnerId,
	paidTopicId,
	privatePodcastEpisodeId,
	publicPodcastEpisodeId,
	publicTopicId,
	request,
	runId,
	sendJson,
	subscriberId,
} from "./podcastEpisodeSmokeFixtures"

// the public topic's episode audio path, which the audio section and the removal section both request
const audioPath = `/episodes/${publicPodcastEpisodeId}/audio.mp3`

/**
 * Checks who may listen to a podcast episode, and returns the owner's read of the public topic's episode.
 */
export async function checkPodcastEpisodeAccess(): Promise<{ smallCoverUrl: string }> {
	// reject route numbers outside the database integer range before querying episodes
	for (const suffix of ["2147483648/1", "2026/2147483648", "-1/1", "2026/0", "?season=2147483648"]) {
		const path = `/topics/${publicTopicId}/episodes${suffix.startsWith("?") ? "" : "/"}${suffix}`
		check(`invalid episode coordinates ${suffix} return 400`, (await request({ path, userId: ownerId })).status === 400)
	}

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

	return ownerPodcastEpisode
}

/**
 * Checks the topic page's podcast, its scan history, and the episode that is recording or failed.
 */
export async function checkTopicPagePodcast(): Promise<void> {
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
}

/**
 * Checks a HEAD and a GET of the audio, and that an invite topic's audio is missing for a visitor.
 */
export async function checkPodcastEpisodeAudio(): Promise<void> {
	// a HEAD of the audio gets the file's length, and a GET redirects
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
}

/**
 * Checks the next unplayed podcast episode, then a listener's saved progress.
 */
export async function checkListenerProgress(): Promise<void> {
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
}

/**
 * Checks the owner's podcast switch, through the route and the settings tool.
 */
export async function checkPodcastSwitch(): Promise<void> {
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
}

/**
 * Checks that a cover loads without a session, and that a made-up cover key is missing.
 */
export async function checkPodcastEpisodeCovers(ownerPodcastEpisode: { smallCoverUrl: string }): Promise<void> {
	// a cover's url works without a session, and a made-up key is missing
	const coverPath: string = ownerPodcastEpisode.smallCoverUrl.replace("/api", "")
	const madeUpCoverPath = coverPath.replace(/[0-9a-f]{32}/, "0".repeat(32))
	check("a made-up cover key is missing", (await request({ path: madeUpCoverPath, userId: null })).status === 404)
	const coverResponse = await request({ path: coverPath, userId: null })
	check(
		"a cover loads without a session",
		coverResponse.status === 200 && coverResponse.headers.get("Content-Type") === "image/jpeg",
	)
}

/**
 * Checks removing a podcast episode, and what the removal takes with it.
 */
export async function checkPodcastEpisodeRemoval(): Promise<void> {
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
}

/**
 * Checks the authorized JSON audio representation after the independent listener-count assertions.
 */
export async function checkPodcastEpisodeAudioJson(): Promise<void> {
	// the JSON representation retains the same access gate for every visibility
	for (const [id, userId, expectedStatus] of [
		[publicPodcastEpisodeId, null, 200],
		[invitePodcastEpisodeId, null, 404],
		[invitePodcastEpisodeId, ownerId, 200],
		[privatePodcastEpisodeId, null, 404],
		[privatePodcastEpisodeId, subscriberId, 404],
		[privatePodcastEpisodeId, paidOwnerId, 200],
	] as const) {
		const response = await request({
			path: `/episodes/${id}/audio.mp3`,
			userId,
			init: { headers: { Accept: "application/json" } },
		})
		check(
			"audio JSON retains visibility and no-store",
			response.status === expectedStatus && response.headers.get("Cache-Control") === "private, no-store",
		)
	}
}
