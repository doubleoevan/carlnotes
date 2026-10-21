// a live smoke test for the podcast episode routes, covering who may listen, the audio, a listener's progress,
// the next unplayed episode, the podcast switch, the feeds, the episode pages, the related topics and episodes,
// the covers, and removal.
// run it with: doppler run -- bun api/podcast/podcastEpisodes.smoke.ts. needs Doppler secrets and no model
import { connectionPool } from "@carlnotes/db"
import { checkGatedPodcastEpisodePages, checkPublicPodcastEpisodePage } from "./podcastEpisodePageSmokeSections"
import { cleanUp, seed, toFailureCount } from "./podcastEpisodeSmokeFixtures"
import {
	checkListenerProgress,
	checkPodcastEpisodeAccess,
	checkPodcastEpisodeAudio,
	checkPodcastEpisodeCovers,
	checkPodcastEpisodeRemoval,
	checkPodcastSwitch,
	checkTopicPagePodcast,
} from "./podcastEpisodeSmokeSections"
import { checkListenerPodcastFeeds, checkPublicPodcastFeed } from "./podcastFeedSmokeSections"
import { checkRelatedTopicsAndPodcastEpisodes } from "./relatedSmokeSections"

// the smoke runs with podcast episodes on, no matter what the environment says
Bun.env.PODCAST_SPEECH_MODEL ||= "smoke-speech-model"

try {
	await seed()

	// who may listen, the topic page's podcast, the audio, a listener's progress, and the podcast switch
	const ownerPodcastEpisode = await checkPodcastEpisodeAccess()
	await checkTopicPagePodcast()
	await checkPodcastEpisodeAudio()
	await checkListenerProgress()
	await checkPodcastSwitch()

	// the feeds, the episode pages, the related topics and episodes, the covers, and removal
	await checkPublicPodcastFeed()
	await checkListenerPodcastFeeds()
	await checkGatedPodcastEpisodePages()
	await checkPublicPodcastEpisodePage()
	await checkRelatedTopicsAndPodcastEpisodes()
	await checkPodcastEpisodeCovers(ownerPodcastEpisode)
	await checkPodcastEpisodeRemoval()
} finally {
	// delete the fixtures no matter what happened, then close the connection pool.
	// an open connection pool keeps the process alive
	await cleanUp()
	await connectionPool.end()
}

// one failure fails the run
if (toFailureCount() > 0) {
	console.error(`${toFailureCount()} check(s) failed`)
	process.exit(1)
}
console.log("episodes smoke passed")
