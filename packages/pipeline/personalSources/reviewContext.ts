// each private model boundary checks the revision again and strips content from provider errors
import {
	isPersonalSourcesContextCurrent,
	type PersonalSourcesContextVersion,
} from "@carlnotes/db/personalSourcesContext"
import { isBudgetRejection } from "@carlnotes/models/models"
import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError } from "ai"

// fixed messages keep private input out of error reporting
const REVIEW_FAILURE_MESSAGES = {
	context_changed: "Personal sources context changed during review. Retry the Scan with current context.",
	public_evidence: "Personal sources public explanation failed its evidence check",
	model_output_truncated: "Personal sources model output reached its token limit",
} as const

export class PersonalSourcesReviewError extends Error {
	constructor(readonly reason: keyof typeof REVIEW_FAILURE_MESSAGES) {
		super(REVIEW_FAILURE_MESSAGES[reason])
	}
}

/**
 * Refuses private input after its revision or the sender’s edit authority changes.
 */
export async function assertPersonalSourcesReviewCurrent(versions?: PersonalSourcesContextVersion[]): Promise<void> {
	for (const version of versions ?? []) {
		if (!(await isPersonalSourcesContextCurrent(version))) {
			throw new PersonalSourcesReviewError("context_changed")
		}
	}
}

/**
 * Preserves a budget classification without allowing a private provider request into failure reporting.
 */
export function toPrivateReviewError(error: unknown): Error {
	if (error instanceof PersonalSourcesReviewError) {
		return new Error(`Private personal sources review failed: ${error.reason}`)
	}
	if (NoObjectGeneratedError.isInstance(error)) {
		return new Error("Private personal sources review failed: invalid_model_output")
	}
	if (NoOutputGeneratedError.isInstance(error)) {
		return new Error("Private personal sources review failed: empty_model_output")
	}
	if (isBudgetRejection(error)) {
		return Object.assign(new Error("Private review budget exhausted"), {
			statusCode: 429,
			responseBody: "budget_exceeded",
		})
	}
	if (APICallError.isInstance(error)) {
		const status = Number.isInteger(error.statusCode) ? error.statusCode : "unknown"
		return new Error(`Private personal sources model request failed: HTTP ${status}`)
	}
	return new Error("Private personal sources review could not complete")
}
