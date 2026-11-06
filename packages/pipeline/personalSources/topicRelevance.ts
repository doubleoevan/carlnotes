// the values that evals/topic-matching measured. the attachment score weight is how much of the amount an attachment
// score passes the Topic's name and prompt score counts. the minimum suggested relevance checks a picker option and
// suggests an email Topic, and the minimum filing relevance files an email
export const TOPIC_ATTACHMENT_SCORE_WEIGHT = 0.5
export const MIN_SUGGESTED_TOPIC_RELEVANCE = 0.55
export const MIN_FILED_TOPIC_RELEVANCE = 0.75

// the most characters of a Topic's text that one embedding reads
export const TOPIC_MATCH_TEXT_CHARS = 8000

/**
 * Returns a Topic's name and prompt, which are embedded apart from its attachment context.
 */
export function toTopicNameAndPromptText({ name, prompt }: { name: string; prompt: string }): string {
	return [name, prompt].filter(Boolean).join("\n").slice(0, TOPIC_MATCH_TEXT_CHARS)
}

/**
 * Scores a Topic from its name and prompt, raised by the weighted amount that its attachment score passes that score.
 */
export function toTopicRelevance({
	nameAndPromptScore,
	attachmentScore,
	attachmentScoreWeight = TOPIC_ATTACHMENT_SCORE_WEIGHT,
}: {
	nameAndPromptScore: number
	attachmentScore: number | null
	attachmentScoreWeight?: number
}): number {
	// an attachment score at or below the name and prompt score adds nothing
	return (
		nameAndPromptScore +
		attachmentScoreWeight * Math.max(0, (attachmentScore ?? nameAndPromptScore) - nameAndPromptScore)
	)
}
