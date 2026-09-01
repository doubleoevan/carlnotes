// the LLM Guard scanner
import { reportError } from "@shared/monitoring"

// the score at or above which a detector counts as a hit
const DEFAULT_INJECTION_THRESHOLD = 0.8

// the network timeout. a page the scanner cannot finish inside it passes unscreened.
// raise LLM_GUARD_TIMEOUT_MS if real pages run past the default
const SCREEN_TIMEOUT_MS = Number(Bun.env.LLM_GUARD_TIMEOUT_MS ?? "2500")

// the detectors that reject each type of text
const SCREEN_TYPES = {
	// an owner's document also gets leaked credentials, the one text they hand us directly
	document: ["PromptInjection", "Secrets", "InvisibleText", "BanTopics", "Toxicity"],
	page: ["PromptInjection", "InvisibleText", "BanTopics", "Toxicity"],
} as const

export type ScreenType = keyof typeof SCREEN_TYPES

// what the scanner decided about an input: whether it is rejected, which detectors fired, and the text to use from
// here
export type ScreenVerdict = { isFlagged: boolean; detectors: string[]; text: string }

// the scanner's response. the score map decides rejection, and sanitized_prompt includes the redacted text
type GuardResponse = { is_valid?: boolean; scanners?: Record<string, number>; sanitized_prompt?: string }

// nothing flagged, so the caller's own text passes straight through
function toUnflagged(text: string): ScreenVerdict {
	return { isFlagged: false, detectors: [], text }
}

/**
 * Screens untrusted text: rejects it when a detector fires, and otherwise returns it with any personal details redacted.
 * Never throws an error. A failure, timeout, or missing url returns the original text unflagged.
 */
export async function screenText(text: string, screenType: ScreenType): Promise<ScreenVerdict> {
	// no scanner configured, as in a self-hosted deployment, or nothing to scan
	const guardUrl = Bun.env.LLM_GUARD_URL
	if (!guardUrl || !text.trim()) {
		return toUnflagged(text)
	}

	try {
		// send the text once, then read this type's detectors out of the scores that come back
		const response = await fetch(`${guardUrl}/analyze/prompt`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt: text }),
			signal: AbortSignal.timeout(SCREEN_TIMEOUT_MS),
		})
		if (!response.ok) {
			throw new Error(`llm-guard returned ${response.status}`)
		}
		return toScreenVerdict((await response.json()) as GuardResponse, screenType, text)
	} catch (error) {
		// if the Scan does not get screened, this report is the only sign the scanner stopped working
		console.error(`llm-guard failed to screen the ${screenType}`, error)
		reportError(error, "scanner", { screenType })
		return toUnflagged(text)
	}
}

/**
 * Reads this screen type's detectors out of the scanner's scores. A detector at or above the threshold rejects the text,
 * and so does a response that rejects it without naming a score. An accepted text comes back redacted.
 */
export function toScreenVerdict(guardResponse: GuardResponse, screenType: ScreenType, text: string): ScreenVerdict {
	// the detectors for this type of text that scored at or above the threshold
	const threshold = Number(Bun.env.LLM_GUARD_INJECTION_THRESHOLD ?? DEFAULT_INJECTION_THRESHOLD)
	const scores = guardResponse.scanners ?? {}
	const detectors = SCREEN_TYPES[screenType].filter((detector) => (scores[detector] ?? 0) >= threshold)
	if (detectors.length > 0) {
		return { isFlagged: true, detectors, text }
	}

	// a rejection that named no score at all still counts as a rejection
	const hasScores = Object.keys(scores).length > 0
	if (guardResponse.is_valid === false && !hasScores) {
		return { isFlagged: true, detectors: ["unnamed"], text }
	}

	// accepted, so the caller uses the redacted text
	return toUnflagged(guardResponse.sanitized_prompt || text)
}

/**
 * Why the scanner flagged a text, naming the detectors that fired.
 */
export function toFlaggedReason(verdict: ScreenVerdict): string {
	return `flagged by the scanner: ${verdict.detectors.join(", ")}`
}
