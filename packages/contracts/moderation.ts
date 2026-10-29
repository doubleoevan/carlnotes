// the moderation contracts: the verdict a classification returns, the rejection a violation gets, and Carl's words
// for it
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

// the rejection a violating write gets
export const OBJECTIONABLE_TEXT_REJECTION = "objectionable"

// the body of that rejection
export const objectionableTextResponse = z.object({
	rejection: z.literal(OBJECTIONABLE_TEXT_REJECTION),
	category: z.enum(moderationCategories),
})

export type ObjectionableTextResponse = z.infer<typeof objectionableTextResponse>

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
 * Returns Carl's rejection of a violating text, naming its category and never quoting the text.
 */
export function toModerationRejectionMessage(category: ModerationCategory): string {
	return `Carl read that twice and won't post it. It reads as ${MODERATION_CATEGORY_LABELS[category]}. Change it and try again.`
}

/**
 * Returns true if a response body is the objectionable-text rejection.
 */
export function isObjectionableTextResponse(body: unknown): body is ObjectionableTextResponse {
	return objectionableTextResponse.safeParse(body).success
}
