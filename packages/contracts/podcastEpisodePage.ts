// the podcast episode page contract: the episode, its topic, the findings it narrates, and its tables
import { z } from "zod"
import { topicFinding } from "./findings"
import { podcastEpisode, podcastEpisodeSummary, podcastEpisodeTranscriptBlock } from "./podcast"
import { topicResponse } from "./topics"

// a podcast episode's page. the episode with its chapters, and the topic with its visibility, byline, and teams.
// the findings that the chapters narrate, whether the user may rate the findings or remove the episode, and the transcript
export const podcastEpisodePageResponse = z.object({
	podcastEpisode,
	topic: topicResponse.pick({
		id: true,
		name: true,
		prompt: true,
		visibility: true,
		owner: true,
		teamLink: true,
		team: true,
		roomTeams: true,
		isTopicOwner: true,
	}),
	topicFindings: z.array(topicFinding),
	canRate: z.boolean(),
	// whether this user may remove the podcast episode
	canRemovePodcastEpisode: z.boolean(),
	transcript: z.array(podcastEpisodeTranscriptBlock),
	// up to fifty of the topic's other published podcast episodes that the user may listen to, newest first, and up to
	// fifty published podcast episodes of other topics that the user may listen to, most related first
	topicPodcastEpisodes: z.array(podcastEpisodeSummary),
	relatedPodcastEpisodes: z.array(podcastEpisodeSummary),
})

export type PodcastEpisodePageResponse = z.infer<typeof podcastEpisodePageResponse>
