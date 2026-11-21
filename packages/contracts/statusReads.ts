// the status reads a page's poll sends in place of the page: a film's render status, a Topic Post Discussion's
// recording status, and a Topic's latest Scan with its newest podcast episode's status. each holds the status alone,
// with no field of the page that shows it
import { z } from "zod"
import { podcastEpisodeStatuses, scanStatuses, topicPostDiscussionStatuses, topicVideoStatuses } from "./enums"

// how often a page polls each status read at first: a film's, a Topic Post Discussion's, and a Scan's
export const STATUS_FIRST_POLL_MS = { topicVideo: 30_000, topicPostDiscussion: 15_000, scan: 3000 } as const

// a podcast episode's film status, or none for a podcast episode with no film row
export const topicVideoStatusRead = z.object({ status: z.enum([...topicVideoStatuses, "none"]) })

export type TopicVideoStatusRead = z.infer<typeof topicVideoStatusRead>

// a Topic Post's newest discussion status, or none for a post with no discussion
export const topicPostDiscussionStatusRead = z.object({ status: z.enum([...topicPostDiscussionStatuses, "none"]) })

export type TopicPostDiscussionStatusRead = z.infer<typeof topicPostDiscussionStatusRead>

// a Topic's latest Scan with its counts, null before its first, and its newest podcast episode's status, null with none
export const topicScanStatusRead = z.object({
	scan: z
		.object({
			id: z.string(),
			status: z.enum(scanStatuses),
			foundCount: z.number(),
			keptCount: z.number(),
		})
		.nullable(),
	podcastEpisodeStatus: z.enum(podcastEpisodeStatuses).nullable(),
})

export type TopicScanStatusRead = z.infer<typeof topicScanStatusRead>
