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

// what a viewer count line counts: a user's profile page, which is always public, or a team's page
export type ViewerCountPage = { kind: "profile"; id: string } | { kind: "team"; id: string; isPublic: boolean }

// the label of a profile's and a team's viewer count
export const VIEWER_COUNT_LABEL = "Visitors"
