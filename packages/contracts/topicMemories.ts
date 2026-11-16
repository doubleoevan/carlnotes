// the paginated Journal and the feedback a Topic owner or team lead can submit
import { z } from "zod"
import { CONTROL_CHARACTER_PATTERN } from "./socialText"

export const topicMemoryKinds = ["fact", "correction"] as const
export const topicMemoryStatuses = ["active", "outdated", "rejected"] as const
export const TOPIC_MEMORY_TEXT_LIMIT = 400
export const TOPIC_MEMORY_NOTE_LIMIT = 400
export const TOPIC_MEMORY_PAGE_SIZE = 5
export const TOPIC_MEMORY_ACTIVE_LIMIT = 100
export const topicMemoryPerson = z.object({
	name: z.string().trim().min(1).max(100),
	identifyingDetail: z.string().trim().min(1).max(160),
})
export type TopicMemoryPerson = z.infer<typeof topicMemoryPerson>

export const topicMemoryPageNumber = z.coerce
	.number()
	.int()
	.min(1)
	.max(Math.floor(Number.MAX_SAFE_INTEGER / TOPIC_MEMORY_PAGE_SIZE))
	.default(1)
export const topicMemoriesQuery = z.object({ page: topicMemoryPageNumber })
// clients can distinguish the saved takeaway limit from ordinary saved feedback
export const topicMemoryFeedbackResult = z.object({ status: z.enum(["saved", "savedTakeawayLimit"]) })
export const topicMemoryFeedbackPayload = z.object({
	rating: z.enum(["up", "down"]).nullable(),
	note: z
		.string()
		.trim()
		.max(TOPIC_MEMORY_NOTE_LIMIT)
		.refine((note) => !CONTROL_CHARACTER_PATTERN.test(note), "Corrections cannot contain control characters")
		.optional(),
})

const topicMemory = z.object({
	id: z.string(),
	kind: z.enum(topicMemoryKinds),
	text: z.string(),
	factDate: z.iso.date().nullable().optional(),
	person: topicMemoryPerson.nullable().optional(),
	firstScanAt: z.string(),
	episodeNumber: z.number().int().nullable(),
	rating: z.enum(["up", "down"]).nullable(),
	note: z.string().nullable(),
})
export const topicMemoriesPage = z.object({
	items: z.array(topicMemory),
	pageCount: z.number().int().nonnegative(),
	canRate: z.boolean(),
})
export type TopicMemoryFeedbackResult = z.infer<typeof topicMemoryFeedbackResult>
export type TopicMemoriesPage = z.infer<typeof topicMemoriesPage>
export type TopicMemory = z.infer<typeof topicMemory>
export type TopicMemoryFeedback = z.infer<typeof topicMemoryFeedbackPayload>
