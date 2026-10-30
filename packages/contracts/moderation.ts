// the moderation contracts: the verdict a classification returns, the image moderation response it reads, the rejection
// a violation gets, and Carl's words for it
import { z } from "zod"

// what a violation is: harassment, hate, sexual content, violence, self-harm, or content that endangers a child
export const moderationCategories = ["harassment", "hate", "sexual", "violence", "selfHarm", "childSafety"] as const

export type ModerationCategory = (typeof moderationCategories)[number]

// the verdict the classification returns: whether the text is a violation, and which category if it is
export const moderationVerdict = z.union([
	z.object({ isViolation: z.literal(false), category: z.null() }),
	z.object({ isViolation: z.literal(true), category: z.enum(moderationCategories) }),
])

export type ModerationVerdict = z.infer<typeof moderationVerdict>

// the omni-moderation categories that count for an image, each with the category Carl names, in the order that picks
// the one a rejection names. plain violence and the illicit categories are left out, and a news photo trips them
const IMAGE_MODERATION_CATEGORIES: [string, ModerationCategory][] = [
	["sexual/minors", "childSafety"],
	["sexual", "sexual"],
	["violence/graphic", "violence"],
	["self-harm", "selfHarm"],
	["self-harm/intent", "selfHarm"],
	["self-harm/instructions", "selfHarm"],
	["hate", "hate"],
	["hate/threatening", "hate"],
	["harassment", "harassment"],
	["harassment/threatening", "harassment"],
]

// the part of OpenAI's moderation response the image check reads: each category's flag, set by OpenAI's own thresholds
export const imageModerationResponse = z.object({
	results: z.array(z.object({ categories: z.record(z.string(), z.boolean().nullable()) })).min(1),
})

/**
 * Returns the category of the first counted category the response flags, or null if it flags none that count.
 */
export function toImageModerationCategory(
	response: z.infer<typeof imageModerationResponse>,
): ModerationCategory | null {
	const [result] = response.results
	const flaggedCategory = IMAGE_MODERATION_CATEGORIES.find(([openaiCategory]) => result?.categories[openaiCategory])
	return flaggedCategory?.[1] ?? null
}

// the rejection a violating text or image gets
export const OBJECTIONABLE_CONTENT_REJECTION = "objectionable"

// the body of that rejection
export const objectionableContentResponse = z.object({
	rejection: z.literal(OBJECTIONABLE_CONTENT_REJECTION),
	category: z.enum(moderationCategories),
})

export type ObjectionableContentResponse = z.infer<typeof objectionableContentResponse>

// how Carl names each category in his rejection
const MODERATION_CATEGORY_LABELS: Record<ModerationCategory, string> = {
	harassment: "harassment",
	hate: "hate",
	sexual: "sexual content",
	violence: "violence",
	selfHarm: "self-harm",
	childSafety: "content that endangers a child",
}

/**
 * Returns Carl's rejection of a violating text or image, naming its category and never quoting the text.
 */
export function toModerationRejectionMessage(category: ModerationCategory): string {
	return `Carl looked at that twice and won't post it. It comes across as ${MODERATION_CATEGORY_LABELS[category]}. Change it and try again.`
}

/**
 * Returns true if a message is Carl's rejection of a violating text or image, for any category.
 */
export function isModerationRejectionMessage(message: string): boolean {
	return moderationCategories.some((category) => toModerationRejectionMessage(category) === message)
}

/**
 * Returns true if a response body is the objectionable-content rejection.
 */
export function isObjectionableContentResponse(body: unknown): body is ObjectionableContentResponse {
	return objectionableContentResponse.safeParse(body).success
}
