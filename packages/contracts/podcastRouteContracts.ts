// the podcast episode routes the app reaches

import type { ApiRouteContract } from "./apiRouteContracts"
import { podcastEpisodeListenPayload, ratingPayload } from "./payloads"
import {
	nextUnplayedPodcastEpisodeResponse,
	podcastEpisode,
	podcastEpisodeAudio,
	podcastFeedUrlResponse,
	seasonPodcastEpisodes,
} from "./podcast"
import { podcastEpisodePageResponse } from "./podcastEpisodePage"
import {
	idParam,
	nextUnplayedPodcastEpisodeQuery,
	okResponse,
	podcastEpisodeChapterParam,
	podcastEpisodePageParam,
	seasonPodcastEpisodesQuery,
} from "./routeShapes"
import { topicPodcastPayload } from "./topicPayloads"

// the entries, in client module order
export const podcastRouteContracts: Record<string, ApiRouteContract> = {
	// podcast episodes
	"podcastEpisodeClient.fetchNextUnplayedPodcastEpisode": {
		method: "GET",
		path: "/api/episodes/next-unplayed",
		query: nextUnplayedPodcastEpisodeQuery,
		response: nextUnplayedPodcastEpisodeResponse,
	},
	"podcastEpisodeClient.fetchPodcastEpisode": {
		method: "GET",
		path: "/api/episodes/:id",
		params: idParam,
		response: podcastEpisode,
	},
	"podcastEpisodeClient.fetchPodcastEpisodeAudio": {
		method: "GET",
		path: "/api/episodes/:id/audio.mp3",
		params: idParam,
		response: podcastEpisodeAudio,
	},
	"podcastEpisodeClient.fetchPodcastEpisodePage": {
		method: "GET",
		path: "/api/topics/:id/episodes/:season/:episodeNumber",
		params: podcastEpisodePageParam,
		response: podcastEpisodePageResponse,
	},
	"podcastEpisodeClient.fetchPodcastFeedUrl": {
		method: "GET",
		path: "/api/topics/:id/podcast-feed",
		params: idParam,
		response: podcastFeedUrlResponse,
	},
	"podcastEpisodeClient.fetchSeasonPodcastEpisodes": {
		method: "GET",
		path: "/api/topics/:id/episodes",
		params: idParam,
		query: seasonPodcastEpisodesQuery,
		response: seasonPodcastEpisodes,
	},
	"podcastEpisodeClient.sendPodcastEpisodeChapterRating": {
		method: "POST",
		path: "/api/episodes/:id/chapters/:position/rating",
		params: podcastEpisodeChapterParam,
		body: { json: ratingPayload },
		response: okResponse,
	},
	"podcastEpisodeClient.sendPodcastEpisodeListen": {
		method: "POST",
		path: "/api/episodes/:id/listen",
		params: idParam,
		body: { json: podcastEpisodeListenPayload },
		response: okResponse,
	},
	"podcastEpisodeClient.sendRemovePodcastEpisode": {
		method: "DELETE",
		path: "/api/episodes/:id",
		params: idParam,
		response: okResponse,
	},
	"podcastEpisodeClient.sendResetPodcastFeed": {
		method: "POST",
		path: "/api/topics/:id/podcast-feed/reset",
		params: idParam,
		response: podcastFeedUrlResponse,
	},
	"podcastEpisodeClient.sendTopicPodcast": {
		method: "PUT",
		path: "/api/topics/:id/podcast",
		params: idParam,
		body: { json: topicPodcastPayload },
		response: okResponse,
	},
}
