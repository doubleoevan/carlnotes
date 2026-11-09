// the podcast episode page contract: the episode, its topic, the findings it narrates, and its tables
import { z } from "zod"
import { topicImageOrigins } from "./enums"
import { topicFinding } from "./findings"
import { homePodcastEpisode, podcastEpisode, podcastEpisodeSummary, podcastEpisodeTranscriptBlock } from "./podcast"
import { commentThreadResponse, reactionSummary } from "./social"
import { imageRegenerationQuota } from "./topicImages"
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
	// whether this user may edit the podcast episode. the image's origin, its image prompt, and the regenerations this
	// month are null for anyone but an editor, and the regenerations are null for an admin too
	canEditPodcastEpisode: z.boolean(),
	podcastEpisodeImageOrigin: z.enum(topicImageOrigins).nullable(),
	podcastEpisodeImagePrompt: z.string().nullable(),
	imageRegenerationQuota: imageRegenerationQuota.nullable(),
	// this episode's position among the home podcast episodes and the home podcast episodes themselves, both null for
	// anyone but an admin
	homeOrder: z.number().nullable(),
	homePodcastEpisodes: z.array(homePodcastEpisode).nullable(),
	transcript: z.array(podcastEpisodeTranscriptBlock),
	// up to fifty of the topic's other published podcast episodes that the user may listen to, newest first, and up to
	// fifty published podcast episodes of other topics that the user may listen to, most related first
	topicPodcastEpisodes: z.array(podcastEpisodeSummary),
	relatedPodcastEpisodes: z.array(podcastEpisodeSummary),
	// the podcast episode's own reactions and the first page of its comment thread
	reactions: reactionSummary.optional(),
	commentThread: commentThreadResponse.optional(),
})

export type PodcastEpisodePageResponse = z.infer<typeof podcastEpisodePageResponse>
