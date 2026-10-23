// the counts of a topic's viewers and followers and a podcast episode's listeners
import { z } from "zod"

// a topic's unique viewers, all time, and its followers
export const topicCounts = z.object({ viewerCount: z.number(), subscriberCount: z.number() })

export type TopicCounts = z.infer<typeof topicCounts>

// a podcast episode's unique listeners, all time
export const podcastEpisodeCounts = z.object({ listenerCount: z.number() })

export type PodcastEpisodeCounts = z.infer<typeof podcastEpisodeCounts>
