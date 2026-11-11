// each sender's scoring call writes a page-only explanation and their private annotation
import type { PersonalSourcesReviewContext } from "@carlnotes/db/personalSourcesContext"
import { type Budget, charge, chargeScoringFailure, premiumModelCost } from "@carlnotes/models/budget"
import { runModelCall } from "@carlnotes/models/modelCallRetry"
import { LOW_REASONING_PROVIDER_OPTIONS, SCORE_OUTPUT_TOKENS, scoreModel } from "@carlnotes/models/models"
import { PRIVATE_MODEL_OPTIONS } from "@carlnotes/models/privateModelOptions"
import { type BuiltPrompt, fetchPromptTemplate } from "@carlnotes/models/prompts/fetch"
import { toUntrustedPromptText, writePrompt } from "@carlnotes/models/prompts/write"
import { generateText, Output } from "ai"
import { z } from "zod"
import { assertPersonalSourcesReviewCurrent, PersonalSourcesReviewError } from "./reviewContext"

// public output can select page text, but cannot introduce model-written private facts
const personalScoreSchema = z.object({
	score: z.number().min(0).max(1),
	isUnsafe: z.boolean(),
	publicEvidence: z.array(z.number().int().min(1)).max(3),
	annotation: z.string().min(1).max(1600).nullable(),
})

// what one sender's scoring returns: the score, the safety judgment, the public page excerpts, and the annotations
export type PersonalSourceScore = {
	score: number
	isUnsafe: boolean
	relevanceExplanation: string
	annotations: { userId: string; text: string }[]
}

// the page, the Topic's context, each sender's private context, the Scan's Budget, and the owner's key
type ScorePersonalSourceResourceOptions = {
	resourceContent: string
	topicContext: string
	personalSources: PersonalSourcesReviewContext[]
	budget: Budget
	litellmApiKey: string
}

/**
 * Writes both layers together for each sender without placing other senders in the same model input.
 */
export async function scorePersonalSourceResource(
	options: ScorePersonalSourceResourceOptions,
): Promise<PersonalSourceScore> {
	// the enclosing Resource reservation covers every sender before any paid call starts
	const content = toUntrustedPromptText(options.resourceContent.slice(0, 8000))
	let result: PersonalSourceScore = { score: 0, isUnsafe: false, relevanceExplanation: "", annotations: [] }
	for (const personalSource of options.personalSources) {
		// write this sender's prompt
		const scorePrompt = await buildPersonalSourceScorePrompt({
			resourceContent: content,
			topicContext: options.topicContext,
			personalSource,
		})

		// a failed attempt that returned usage is charged, and a rate limit waits and tries again, logging no private text.
		// each attempt sends the private prompt only while the sender's context is still current
		const generated = await runModelCall({
			runAttempt: async () => {
				await assertPersonalSourcesReviewCurrent([personalSource])
				return generateText({
					model: scoreModel(options.litellmApiKey),
					prompt: scorePrompt.prompt,
					output: Output.object({ schema: personalScoreSchema }),
					maxOutputTokens: SCORE_OUTPUT_TOKENS,
					maxRetries: 0,
					providerOptions: LOW_REASONING_PROVIDER_OPTIONS,
					...PRIVATE_MODEL_OPTIONS,
				}).catch((error: unknown) => chargeScoringFailure(options.budget, "scoringPremium", error))
			},
			waitDeadlineAt: options.budget.modelCallWaitDeadlineAt,
			label: "scoringPremium",
			isPrivate: true,
		})

		// account for paid output before reading a structured result that may be missing
		charge(options.budget, "scoringPremium", premiumModelCost(generated.usage))
		if (generated.finishReason === "length") {
			throw new PersonalSourcesReviewError("model_output_truncated")
		}

		// validate the output while the private context is still current, and stop at an unsafe page
		await assertPersonalSourcesReviewCurrent([personalSource])
		const scored = validatePersonalSourceScore({ output: generated.output, resourceContent: content, personalSource })
		if (scored.isUnsafe) {
			return scored
		}

		// keep the best score's explanation and every sender's annotation
		result = {
			...(scored.score > result.score || !result.relevanceExplanation ? scored : result),
			annotations: [...result.annotations, ...scored.annotations],
		}
	}
	return result
}

/**
 * Builds bounded, separately fenced page, Topic, and single-sender inputs.
 */
export async function buildPersonalSourceScorePrompt({
	resourceContent,
	topicContext,
	personalSource,
}: {
	resourceContent: string
	topicContext: string
	personalSource: PersonalSourcesReviewContext
}): Promise<BuiltPrompt> {
	// number the page passages and bound each input
	const { template, name, registryPrompt } = await fetchPromptTemplate("score-personal-source-resource")
	const prompt = writePrompt(template, {
		resourceContent: toPagePassages(resourceContent)
			.map((text, index) => `[${index + 1}] ${text}`)
			.join("\n\n"),
		topicContext: topicContext.slice(0, 8000),
		personalSources: personalSource.text.slice(0, 8000),
	})
	return { prompt, name, registryPrompt }
}

/**
 * Builds the public explanation exclusively from contiguous page excerpts and binds the annotation outside the model.
 */
export function validatePersonalSourceScore({
	output,
	resourceContent,
	personalSource,
}: {
	output: z.infer<typeof personalScoreSchema>
	resourceContent: string
	personalSource: PersonalSourcesReviewContext
}): PersonalSourceScore {
	if (output.isUnsafe) {
		return { score: output.score, isUnsafe: true, relevanceExplanation: "", annotations: [] }
	}

	// construct public text from server-owned page passages, never model-written prose
	const passages = toPagePassages(resourceContent)
	const passageNumbers = [...new Set(output.publicEvidence)]
	if (passageNumbers.length === 0) {
		return { score: 0, isUnsafe: false, relevanceExplanation: "", annotations: [] }
	}
	if (passageNumbers.some((number) => !Number.isInteger(number) || number < 1 || number > passages.length)) {
		throw new PersonalSourcesReviewError("public_evidence")
	}

	// join the chosen passages, and bind the annotation to its sender
	return {
		score: output.score,
		isUnsafe: false,
		relevanceExplanation: passageNumbers.map((number) => passages[number - 1]).join("\n\n"),
		annotations: output.annotation ? [{ userId: personalSource.userId, text: output.annotation }] : [],
	}
}

// keep readable paragraphs and split oversized ones at a word boundary
function toPagePassages(resourceContent: string): string[] {
	// split the bounded page into paragraphs
	const paragraphs = toUntrustedPromptText(resourceContent.slice(0, 8000)).split(/\n\s*\n/)
	const passages: string[] = []
	for (const paragraph of paragraphs) {
		// cut a long paragraph at the last word before the passage limit
		let remainingText = paragraph.trim()
		while (remainingText.length > 1200) {
			const wordEnd = remainingText.lastIndexOf(" ", 1200)
			const splitAt = wordEnd >= 20 ? wordEnd : 1200
			passages.push(remainingText.slice(0, splitAt).trim())
			remainingText = remainingText.slice(splitAt).trim()
		}

		// keep the rest if it is long enough to read
		if (remainingText.length >= 20) {
			passages.push(remainingText)
		}
	}
	return passages
}
