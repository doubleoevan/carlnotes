// the counts of a topic's viewers and followers, a podcast episode's listeners, and a profile's and a team's viewers
import { z } from "zod"

// a topic's unique viewers, all time, and its followers
export const topicCounts = z.object({ viewerCount: z.number(), subscriberCount: z.number() })

export type TopicCounts = z.infer<typeof topicCounts>

// a podcast episode's unique listeners, all time
export const podcastEpisodeCounts = z.object({ listenerCount: z.number() })

export type PodcastEpisodeCounts = z.infer<typeof podcastEpisodeCounts>

// a profile's or a team's unique viewers, all time
export const viewerCounts = z.object({ viewerCount: z.number() })

export type ViewerCounts = z.infer<typeof viewerCounts>

// what a viewer count line counts: a user's profile page, which is always public, a team's page, or a Topic Post's
// page, whose Topic may be public
export type ViewerCountPage =
	| { kind: "profile"; id: string }
	| { kind: "team" | "topicPost"; id: string; isPublic: boolean }

// the label of every viewer count: a topic's, a profile's, a team's, and a Topic Post's
export const VIEWER_COUNT_LABEL = "Visitors"
