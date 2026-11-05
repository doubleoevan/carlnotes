// score bounds and promotion are shared by review persistence and podcast ranking
const REVIEW_PROMOTION_THRESHOLD = Number(Bun.env.REVIEW_PROMOTION_THRESHOLD ?? "0.6")

/**
 * Whether a cheap model score is high enough to earn a premium model re-score.
 */
export function isPromoted(score: number): boolean {
	return score >= REVIEW_PROMOTION_THRESHOLD
}

/**
 * Returns the score limited to the 0 to 1 range.
 */
export function clampScore(score: number): number {
	return Math.max(0, Math.min(1, score))
}
