// One bounded vision call selects animation for the public pictures a chapter actually shows.
import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { chatModel, LOW_REASONING_PROVIDER_OPTIONS } from "@carlnotes/models/models"
import { PRIVATE_MODEL_OPTIONS } from "@carlnotes/models/privateModelOptions"
import { fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText, NoObjectGeneratedError, Output, type UserContent } from "ai"
import { z } from "zod"
import { CHAPTER_ANIMATION_CANDIDATE_LIMIT, type PictureAnimation } from "./pictureAnimation"
import { type AnimationCandidate, pictureAnimationChoices } from "./pictureAnimationChoices"

const selection = z.strictObject({
	picture: z.int().min(1).max(CHAPTER_ANIMATION_CANDIDATE_LIMIT),
	observed: z.string().max(160),
	crop: z
		.int()
		.min(0)
		.max(CHAPTER_ANIMATION_CANDIDATE_LIMIT * 4),
})
const response = z.object({ regions: z.array(selection).max(CHAPTER_ANIMATION_CANDIDATE_LIMIT) })

/**
 * Selects a single bounded animation per eligible chapter picture and bills the configured film payer.
 */
export async function planPictureAnimation(
	pictures: AnimationCandidate[],
	billing: { ownerId: string; isPlatformBilled: boolean; recordCost?: (dollars: number) => Promise<void> },
	signal?: AbortSignal,
): Promise<(PictureAnimation & { sourceImageHash: string })[]> {
	// Reserve room for both photos and illustrations when a chapter supplies both.
	const generated = pictures.filter((picture) => picture.origin === "generated")
	const fetched = pictures.filter((picture) => picture.origin === "resource")
	const candidates = [...new Set([generated[0], fetched[0], ...pictures])]
		.filter((picture): picture is AnimationCandidate => !!picture)
		.slice(0, CHAPTER_ANIMATION_CANDIDATE_LIMIT)
	if (candidates.length === 0) {
		return []
	}

	// Send small composed thumbnails with trusted ordinal labels. The original pixels stay in the film.
	const { template, name, registryPrompt } = await fetchPromptTemplate("plan-picture-animation")
	const prompt = writePrompt(template, {})
	const content: Exclude<UserContent, string> = []
	const boxes = new Map<number, { sourceImageHash: string; picture: number; region: PictureAnimation }>()
	for (const [index, picture] of candidates.entries()) {
		signal?.throwIfAborted()
		const { jpeg, choices } = await pictureAnimationChoices(picture, index)
		for (const [number, box] of choices) {
			boxes.set(number, { sourceImageHash: picture.sourceImageHash, picture: index + 1, region: box })
		}
		content.push(
			{ type: "text", text: `Picture ${index + 1}, ${picture.origin === "generated" ? "illustration" : "photo"}` },
			{ type: "image", image: jpeg, mediaType: "image/jpeg" },
		)
	}

	if (boxes.size === 0) {
		return []
	}

	// Limit planner time, input pictures, model output and attempts.
	const key = billing.isPlatformBilled ? undefined : await loadOrProvisionUserLiteLLMKey(billing.ownerId)
	const timeout = AbortSignal.timeout(75000)
	content.push({ type: "text", text: prompt })
	const { output, usage } = await generateText({
		model: chatModel(key),
		providerOptions: LOW_REASONING_PROVIDER_OPTIONS,
		messages: [{ role: "user", content }],
		output: Output.object({ schema: response }),
		maxOutputTokens: 2400,
		maxRetries: 0,
		abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
		...promptTelemetry({ name, prompt, registryPrompt }),
		...PRIVATE_MODEL_OPTIONS,
	}).catch(async (error: unknown) => {
		// Account for a completed response even when its structured selection was invalid.
		if (NoObjectGeneratedError.isInstance(error) && error.usage) {
			await billing.recordCost?.(tokenCost(error.usage.totalTokens ?? 0, CHAT_COST_PER_MILLION_TOKENS))
		}
		throw error
	})
	await billing.recordCost?.(tokenCost(usage.totalTokens ?? 0, CHAT_COST_PER_MILLION_TOKENS))

	// Bind proposed regions to supplied bytes and discard duplications and unsupported selections.
	const proposed = output.regions.flatMap(({ crop, picture }) => {
		const candidate = boxes.get(crop)
		return candidate && candidate.picture === picture
			? [{ ...candidate.region, sourceImageHash: candidate.sourceImageHash }]
			: []
	})
	const regions = proposed.filter(
		(region) => proposed.filter((other) => other.sourceImageHash === region.sourceImageHash).length === 1,
	)
	console.info("Film picture animation", {
		pictures: candidates.length,
		moving: regions.length,
		inputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
	})
	return regions
}
