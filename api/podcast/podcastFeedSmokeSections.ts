// the podcast feed smoke sections: the public feed and its Redis cache, a listener's own feed and its token, a reset,
// and the unsubscribe that ends the token
import { eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { deletePodcastFeedCache, toPodcastFeedCacheKey } from "../../db/podcastFeedCache"
import { readRedisJson } from "../../db/redis"
import { podcastEpisodeListens, podcastEpisodes } from "../../db/schema/podcast"
import { setTopicSubscription } from "../topic/subscriptions"
import {
	check,
	invitePodcastEpisodeId,
	inviteTopicId,
	ownerId,
	publicPodcastEpisodeId,
	publicTopicId,
	request,
	subscriberId,
} from "./podcastEpisodeSmokeFixtures"

/**
 * Checks the public feed, the 304 a current copy gets, and the Redis cache that a long feed skips.
 */
export async function checkPublicPodcastFeed(): Promise<void> {
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
}

/**
 * Checks the feed urls, a listener's own feed and its token, a late subscriber's feed, a reset, and the unsubscribe.
 */
export async function checkListenerPodcastFeeds(): Promise<void> {
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
	await setTopicSubscription({
		userId: subscriberId,
		topicId: inviteTopicId,
		isSubscribed: false,
		analyticsProperties: {
			entryPoint: "web",
			plan: "free",
			platform: "desktop",
			browserPlatform: "other",
			isInAppBrowser: false,
		},
	})
	check(
		"unsubscribing deletes the token",
		(await request({ path: new URL(resetFeedUrl).pathname, userId: null })).status === 404,
	)
}
