// pure ranking and report steps for the Topic matching eval, with no model calls
import type { TopicMatchingCase, TopicMatchingTopic } from "./topicMatchingCases"

// one Topic's scores against sent content
export type TopicScores = { combinedScore: number; nameAndPromptScore: number; attachmentScore: number | null }

// a named way to turn a Topic's scores into its relevance
export type TopicMatchingFormula = { name: string; toRelevance: (topicScores: TopicScores) => number }

// what one formula did across every case, at the given minimum relevances
export type TopicMatchingFormulaReport = {
	name: string
	topMatchCount: number
	expectedCaseCount: number
	decoysHeldCount: number
	decoyCount: number
	// the labeled Topics that clear each minimum relevance, the no-match bound, and the missed cases
	suggestedTopicCount: number
	filedTopicCount: number
	lowestExpectedScore: number
	bestNoMatchScore: number
	noMatchCaseCount: number
	missedCaseLabels: string[]
}

type ToFormulaReportOptions = {
	formula: TopicMatchingFormula
	topics: TopicMatchingTopic[]
	cases: TopicMatchingCase[]
	toTopicScores: (topicCase: TopicMatchingCase, topic: TopicMatchingTopic) => TopicScores
	minimumSuggestedRelevance: number
	minimumFiledRelevance: number
}

/**
 * Ranks every case's Topics under one formula and adds up its top matches, decoys, minimum relevance clearance, and
 * no-match bound.
 */
export function toFormulaReport({
	formula,
	topics,
	cases,
	toTopicScores,
	minimumSuggestedRelevance,
	minimumFiledRelevance,
}: ToFormulaReportOptions): TopicMatchingFormulaReport {
	const report: TopicMatchingFormulaReport = {
		name: formula.name,
		topMatchCount: 0,
		expectedCaseCount: 0,
		decoysHeldCount: 0,
		decoyCount: 0,
		suggestedTopicCount: 0,
		filedTopicCount: 0,
		lowestExpectedScore: 1,
		bestNoMatchScore: -1,
		noMatchCaseCount: 0,
		missedCaseLabels: [],
	}
	for (const topicCase of cases) {
		// order this case's Topics the way the matcher does, by relevance and then id
		const rankedTopics = topics
			.map((topic) => ({ id: topic.id, relevance: formula.toRelevance(toTopicScores(topicCase, topic)) }))
			.toSorted((left, right) => right.relevance - left.relevance || left.id.localeCompare(right.id))
		const bestTopic = rankedTopics[0]
		if (!bestTopic) {
			continue
		}

		// a case with no expected Topic only bounds how high an unrelated Topic can score
		if (!topicCase.expectedTopicIds.length) {
			report.noMatchCaseCount += 1
			report.bestNoMatchScore = Math.max(report.bestNoMatchScore, bestTopic.relevance)
			continue
		}

		addLabeledCase(report, { topicCase, rankedTopics, minimumSuggestedRelevance, minimumFiledRelevance })
	}
	return report
}

// one case's ranked Topics, each with its relevance
type RankedTopic = { id: string; relevance: number }
type LabeledCase = {
	topicCase: TopicMatchingCase
	rankedTopics: RankedTopic[]
	minimumSuggestedRelevance: number
	minimumFiledRelevance: number
}

// count the labeled Topic's rank, its clearance of each minimum relevance, and whether each decoy stayed below it
function addLabeledCase(
	report: TopicMatchingFormulaReport,
	{ topicCase, rankedTopics, minimumSuggestedRelevance, minimumFiledRelevance }: LabeledCase,
): void {
	const expectedTopic = rankedTopics.find((topic) => topicCase.expectedTopicIds.includes(topic.id))
	const expectedScore = expectedTopic?.relevance ?? -1
	const bestTopic = rankedTopics[0]
	report.expectedCaseCount += 1
	report.lowestExpectedScore = Math.min(report.lowestExpectedScore, expectedScore)
	report.suggestedTopicCount += expectedScore > minimumSuggestedRelevance ? 1 : 0
	report.filedTopicCount += expectedScore >= minimumFiledRelevance ? 1 : 0
	// count a top match if the expected Topic ranks first. otherwise record the miss
	if (expectedTopic && expectedTopic === bestTopic) {
		report.topMatchCount += 1
	} else {
		report.missedCaseLabels.push(`${topicCase.label} ranked ${bestTopic?.id}`)
	}
	// count each decoy that stayed below the expected Topic
	for (const decoyTopicId of topicCase.decoyTopicIds ?? []) {
		const decoyScore = rankedTopics.find((topic) => topic.id === decoyTopicId)?.relevance ?? 1
		report.decoyCount += 1
		report.decoysHeldCount += expectedScore > decoyScore ? 1 : 0
	}
}

type ToMinimumRelevanceReportLinesOptions = Omit<
	ToFormulaReportOptions,
	"minimumSuggestedRelevance" | "minimumFiledRelevance"
> & {
	minimumRelevances: number[]
}

/**
 * Returns one line per candidate minimum relevance, with how many labeled Topics and no-match cases clear it under one formula.
 */
export function toMinimumRelevanceReportLines({
	formula,
	topics,
	cases,
	toTopicScores,
	minimumRelevances,
}: ToMinimumRelevanceReportLinesOptions): string[] {
	const toBestRelevance = (topicCase: TopicMatchingCase, caseTopics: TopicMatchingTopic[]): number =>
		Math.max(...caseTopics.map((topic) => formula.toRelevance(toTopicScores(topicCase, topic))))
	const expectedScores = cases
		.filter((topicCase) => topicCase.expectedTopicIds.length)
		.map((topicCase) =>
			toBestRelevance(
				topicCase,
				topics.filter((topic) => topicCase.expectedTopicIds.includes(topic.id)),
			),
		)
	const noMatchScores = cases
		.filter((topicCase) => !topicCase.expectedTopicIds.length)
		.map((topicCase) => toBestRelevance(topicCase, topics))
	// return one line for each minimum relevance
	return minimumRelevances.map((minimumRelevance) => {
		const clearedCount = expectedScores.filter((score) => score > minimumRelevance).length
		const noMatchCount = noMatchScores.filter((score) => score > minimumRelevance).length
		return `minimum ${minimumRelevance}: ${clearedCount}/${expectedScores.length} labeled Topics, ${noMatchCount}/${noMatchScores.length} no-match cases`
	})
}

/**
 * Formats one formula's report as one line, with a second line for its missed cases.
 */
export function toFormulaReportLine(report: TopicMatchingFormulaReport): string {
	const cells = [
		report.name.padEnd(22),
		`top ${report.topMatchCount}/${report.expectedCaseCount}`,
		`decoys ${report.decoysHeldCount}/${report.decoyCount}`,
		`suggested ${report.suggestedTopicCount}/${report.expectedCaseCount}`,
		`filed ${report.filedTopicCount}/${report.expectedCaseCount}`,
		`lowest expected ${report.lowestExpectedScore.toFixed(3)}`,
		`best no-match ${report.bestNoMatchScore.toFixed(3)}`,
	]
	const missedText = report.missedCaseLabels.length ? `\n  missed: ${report.missedCaseLabels.join("; ")}` : ""
	return `${cells.join(" | ")}${missedText}`
}
