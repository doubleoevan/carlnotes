// source preferences are actual score additions, shared by queued links and Finding persistence
export const CUSTOM_SOURCE_SCORE_BONUS = 0.05
export const PERSONAL_SOURCE_SCORE_BONUS = 0.1
export const AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS = 0.05

// what a user adds to a Finding's reaction signal before their account weight: more for commenting on it than for a
// Reaction. a page whose Finding reaches the minimum is listed with the liked scoring examples
export const COMMENT_SIGNAL = 2
export const REACTION_SIGNAL = 1
export const MINIMUM_REACTION_SIGNAL = 2

// retain the strongest Topic-local personal contribution across every re-score
export type PersonalSourceScoreBonus =
	| 0
	| typeof PERSONAL_SOURCE_SCORE_BONUS
	| typeof AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS
