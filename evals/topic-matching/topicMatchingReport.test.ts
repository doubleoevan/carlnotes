import { expect, test } from "bun:test"
import type { TopicMatchingCase, TopicMatchingTopic } from "./topicMatchingCases"
import { type TopicScores, toFormulaReport, toFormulaReportLine } from "./topicMatchingReport"

// two Topics and a case for each outcome the report counts
const TOPICS: TopicMatchingTopic[] = [
	{ id: "right", name: "Right", prompt: "", context: "" },
	{ id: "wrong", name: "Wrong", prompt: "", context: "" },
]
const CASES: TopicMatchingCase[] = [
	{ label: "held", content: "held", expectedTopicIds: ["right"], decoyTopicIds: ["wrong"] },
	{ label: "beaten", content: "beaten", expectedTopicIds: ["right"], decoyTopicIds: ["wrong"] },
	{ label: "unrelated", content: "unrelated", expectedTopicIds: [] },
]
const SCORES: Record<string, Record<string, number>> = {
	held: { right: 0.8, wrong: 0.5 },
	beaten: { right: 0.65, wrong: 0.7 },
	unrelated: { right: 0.3, wrong: 0.4 },
}

// read the labeled score as the name and prompt score, so the formula reports it back
function toTopicScores(topicCase: TopicMatchingCase, topic: TopicMatchingTopic): TopicScores {
	return { combinedScore: 0, nameAndPromptScore: SCORES[topicCase.content]?.[topic.id] ?? 0, attachmentScore: null }
}

test("a report counts top matches, decoys, each minimum relevance, and the no-match bound", () => {
	const report = toFormulaReport({
		formula: { name: "name and prompt", toRelevance: ({ nameAndPromptScore }) => nameAndPromptScore },
		topics: TOPICS,
		cases: CASES,
		toTopicScores,
		minimumSuggestedRelevance: 0.6,
		minimumFiledRelevance: 0.75,
	})

	// the second case fails its top match and its decoy, and clears only the minimum suggested relevance
	expect(report).toMatchObject({
		topMatchCount: 1,
		expectedCaseCount: 2,
		decoysHeldCount: 1,
		decoyCount: 2,
		suggestedTopicCount: 2,
		filedTopicCount: 1,
		noMatchCaseCount: 1,
		missedCaseLabels: ["beaten ranked wrong"],
	})
	expect(report.lowestExpectedScore).toBe(0.65)
	expect(report.bestNoMatchScore).toBe(0.4)

	// the printed line names every number that setting a minimum relevance reads
	expect(toFormulaReportLine(report)).toContain("best no-match 0.400")
})
