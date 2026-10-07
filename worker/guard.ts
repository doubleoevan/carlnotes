// the LLM Guard scanner
import { SCANNER_FLAGGED_REASON_PREFIX } from "@shared/contracts"
import { reportError } from "@shared/monitoring"

// the score at or above which a detector counts as a hit
const DEFAULT_INJECTION_THRESHOLD = 0.8

// the llm-guard network timeout. a page it cannot finish inside passes unscreened.
// raise LLM_GUARD_TIMEOUT_MS if real pages run past the default
const SCREEN_TIMEOUT_MS = Number(Bun.env.LLM_GUARD_TIMEOUT_MS ?? "2500")

// the detectors that reject each type of text
const SCREEN_TYPES = {
	// a chat attachment or a page attached by url, which also gets the leaked credentials check
	document: ["PromptInjection", "Secrets", "InvisibleText", "BanTopics", "Toxicity"],
	page: ["PromptInjection", "InvisibleText", "BanTopics", "Toxicity"],
	// a file that a topic's owner uploads, with no injection check. the file has the authority of the owner's own prompt
	upload: ["Secrets", "InvisibleText", "BanTopics", "Toxicity"],
} as const

// the scanners that a type of text skips. an owner's upload keeps its personal details and takes no injection check
const SUPPRESSED_SCANNERS: Partial<Record<keyof typeof SCREEN_TYPES, string[]>> = {
	upload: ["PromptInjection", "Anonymize"],
}

export type ScreenType = keyof typeof SCREEN_TYPES

// how the llm-guard screen ended: it answered, it never ran, or a configured scanner did not answer
export type ScreenOutcome = "screened" | "skipped" | "failed"

// what llm-guard decided: the rejection, the detectors that fired, the text to use, and how the screen ended
export type ScreenVerdict = { isFlagged: boolean; detectors: string[]; text: string; outcome: ScreenOutcome }

// the scanner's response. the score map decides rejection, and sanitized_prompt includes the redacted text
type GuardResponse = { is_valid?: boolean; scanners?: Record<string, number>; sanitized_prompt?: string }

// nothing flagged, so the caller's own text passes straight through
function toUnflagged(text: string, outcome: ScreenOutcome): ScreenVerdict {
	return { isFlagged: false, detectors: [], text, outcome }
}

/**
 * Screens untrusted text with llm-guard: rejects it when a detector fires, and otherwise returns it with personal details redacted.
 * Never throws: a failure, timeout, or missing url returns the text unflagged, with the outcome naming which happened.
 */
export async function screenText(
	text: string,
	screenType: ScreenType,
	options: { timeoutMs?: number } = {},
): Promise<ScreenVerdict> {
	// no scanner configured, as in a self-hosted deployment, or nothing to scan
	const guardUrl = Bun.env.LLM_GUARD_URL
	if (!guardUrl || !text.trim()) {
		return toUnflagged(text, "skipped")
	}

	try {
		// send the text once, then read this type's detectors out of the scores that come back
		const response = await fetch(`${guardUrl}/analyze/prompt`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt: text, scanners_suppress: SUPPRESSED_SCANNERS[screenType] ?? [] }),
			signal: AbortSignal.timeout(options.timeoutMs ?? SCREEN_TIMEOUT_MS),
		})
		if (!response.ok) {
			throw new Error(`llm-guard returned ${response.status}`)
		}

		// fail open on a rejection that names no scanner, which is a broken response
		const guardResponse = (await response.json()) as GuardResponse
		if (guardResponse.is_valid === false && Object.keys(guardResponse.scanners ?? {}).length === 0) {
			throw new Error("llm-guard rejected the text without naming a scanner")
		}
		return toScreenVerdict(guardResponse, screenType, text)
	} catch (error) {
		// if the Scan does not get an llm-guard screen, this report is the only sign the scanner stopped working
		console.error(`llm-guard failed to screen the ${screenType}`, error)
		reportError(error, "scanner", { screenType })
		return toUnflagged(text, "failed")
	}
}

/**
 * Reads this screen type's detectors out of llm-guard's scores. A detector at or above the threshold rejects the text.
 * An accepted text comes back redacted.
 */
export function toScreenVerdict(guardResponse: GuardResponse, screenType: ScreenType, text: string): ScreenVerdict {
	// the detectors for this type of text that scored at or above the threshold
	const threshold = Number(Bun.env.LLM_GUARD_INJECTION_THRESHOLD ?? DEFAULT_INJECTION_THRESHOLD)
	const scores = guardResponse.scanners ?? {}
	const detectors = SCREEN_TYPES[screenType].filter((detector) => (scores[detector] ?? 0) >= threshold)
	if (detectors.length > 0) {
		return { isFlagged: true, detectors, text, outcome: "screened" }
	}

	// accepted, so the caller uses the redacted text
	return toUnflagged(guardResponse.sanitized_prompt || text, "screened")
}

/**
 * Why the scanner flagged a text, naming the detectors that fired.
 */
export function toFlaggedReason(verdict: ScreenVerdict): string {
	return `${SCANNER_FLAGGED_REASON_PREFIX}: ${verdict.detectors.join(", ")}`
}
