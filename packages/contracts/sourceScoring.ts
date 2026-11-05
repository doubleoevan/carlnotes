// source preferences are actual score additions, shared by queued links and Finding persistence
export const CUSTOM_SOURCE_SCORE_BONUS = 0.05
export const PERSONAL_SOURCE_SCORE_BONUS = 0.1
export const AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS = 0.05

// retain the strongest Topic-local personal contribution across every re-score
export type PersonalSourceScoreBonus =
	| 0
	| typeof PERSONAL_SOURCE_SCORE_BONUS
	| typeof AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS
