// the agreement check: whether the user's message agrees to, declines, or does not clearly answer the change carl
// proposed in the turn before it. it reads only the user's own words and the proposal

import { cheapModel } from "@carlnotes/models/models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { reportError } from "@carlnotes/server/monitoring"
import { generateText, Output } from "ai"
import { z } from "zod"

// how much of the user's message and of the proposal the check reads, which bounds what one check costs
const USER_MESSAGE_CHARS = 2000
const PROPOSAL_CHARS = 6000

// how long the check may take before it counts as unclear
const AGREEMENT_CHECK_TIMEOUT_MS = 10_000

// the one decision the check returns
export const agreementSchema = z.object({ decision: z.enum(["agree", "decline", "unclear"]) })

export type AgreementDecision = z.infer<typeof agreementSchema>["decision"]

// the user's own words from this message, typed or transcribed, the proposal as labeled lines, and the key the check
// bills
export type CheckAgreementOptions = { userWords: string; proposal: string; litellmApiKey?: string }

// what the check decided, and the tokens it spent
export type CheckAgreementResult = { decision: AgreementDecision; totalTokens: number }

/**
 * Decides whether the user's message agrees to, declines, or does not clearly answer the proposal.
 * A message with no words is unclear with no call, and a check that fails or times out is unclear, so it fails closed.
 */
export async function checkAgreement({
	userWords,
	proposal,
	litellmApiKey,
}: CheckAgreementOptions): Promise<CheckAgreementResult> {
	// a message with no words agrees to nothing
	if (!userWords.trim()) {
		return { decision: "unclear", totalTokens: 0 }
	}

	// one cheap call that returns the decision through the schema
	try {
		const agreementPrompt = await buildAgreementPrompt(userWords, proposal)
		const { output, usage } = await generateText({
			model: cheapModel(litellmApiKey),
			output: Output.object({ schema: agreementSchema }),
			prompt: agreementPrompt.prompt,
			abortSignal: AbortSignal.timeout(AGREEMENT_CHECK_TIMEOUT_MS),
			...promptTelemetry(agreementPrompt),
		})
		return { decision: output.decision, totalTokens: usage.totalTokens ?? 0 }
	} catch (error) {
		// a check that fails agrees to nothing
		console.error("the agreement check failed", error)
		reportError(error, "chat")
		return { decision: "unclear", totalTokens: 0 }
	}
}

/**
 * Builds the agreement check's prompt from 'check-agreement.md', with the user's words and the proposal fenced as data.
 */
export async function buildAgreementPrompt(userWords: string, proposal: string): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("check-agreement")
	const prompt = writePrompt(template, {
		readerMessage: userWords.slice(0, USER_MESSAGE_CHARS),
		proposal: proposal.slice(0, PROPOSAL_CHARS),
	})
	return { prompt, name, registryPrompt }
}
