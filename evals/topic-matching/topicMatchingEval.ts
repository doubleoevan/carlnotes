// compares ranking formulas for Personal sources Topic matching over labeled cases and real embeddings, and saves the
// report outside CI
import { embedVectors } from "@carlnotes/models/models"
import {
	MIN_FILED_TOPIC_RELEVANCE,
	MIN_SUGGESTED_TOPIC_RELEVANCE,
	TOPIC_ATTACHMENT_SCORE_WEIGHT,
	TOPIC_MATCH_TEXT_CHARS,
	toTopicNameAndPromptText,
	toTopicRelevance,
} from "@carlnotes/pipeline/personalSources/topicRelevance"
import { cosineSimilarity } from "ai"
import { readGitState, saveEvalResult } from "../evalHarness"
import {
	TOPIC_MATCHING_CASES,
	TOPIC_MATCHING_TOPICS,
	type TopicMatchingCase,
	type TopicMatchingTopic,
} from "./topicMatchingCases"
import {
	type TopicMatchingFormula,
	type TopicScores,
	toFormulaReport,
	toFormulaReportLine,
	toMinimumRelevanceReportLines,
} from "./topicMatchingReport"

// the attachment score weights and minimum relevances that the report compares
const ATTACHMENT_SCORE_WEIGHTS = [0.25, 0.35, 0.5, 0.65, 0.75]
const MINIMUM_RELEVANCES = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75]

// a Topic's name, prompt, and context as one text
const toCombinedText = (topic: TopicMatchingTopic): string =>
	[topic.name, topic.prompt, topic.context].filter(Boolean).join("\n").slice(0, TOPIC_MATCH_TEXT_CHARS)

// embed every unique text once
const texts = [
	...new Set([
		...TOPIC_MATCHING_CASES.map((topicCase) => topicCase.content),
		...TOPIC_MATCHING_TOPICS.flatMap((topic) => [
			toCombinedText(topic),
			toTopicNameAndPromptText(topic),
			topic.context,
		]),
	]),
].filter(Boolean)
// embed the texts and store each vector by its text
const vectors = await embedVectors(texts)
const vectorsByText = new Map(texts.map((text, index) => [text, vectors[index] ?? []]))

// compare sent content with one Topic text
const toScore = (content: string, text: string): number =>
	cosineSimilarity(vectorsByText.get(content) ?? [], vectorsByText.get(text) ?? [])
const toTopicScores = (topicCase: TopicMatchingCase, topic: TopicMatchingTopic): TopicScores => ({
	combinedScore: toScore(topicCase.content, toCombinedText(topic)),
	nameAndPromptScore: toScore(topicCase.content, toTopicNameAndPromptText(topic)),
	attachmentScore: topic.context ? toScore(topicCase.content, topic.context) : null,
})

// the combined text, the name and prompt alone, and each attachment score weight
const toWeightedFormula = (attachmentScoreWeight: number): TopicMatchingFormula => ({
	name: `weight ${attachmentScoreWeight}`,
	toRelevance: ({ nameAndPromptScore, attachmentScore }) =>
		toTopicRelevance({ nameAndPromptScore, attachmentScore, attachmentScoreWeight }),
})
const formulas: TopicMatchingFormula[] = [
	{ name: "combined text", toRelevance: ({ combinedScore }) => combinedScore },
	{ name: "name and prompt only", toRelevance: ({ nameAndPromptScore }) => nameAndPromptScore },
	...ATTACHMENT_SCORE_WEIGHTS.map(toWeightedFormula),
]
const reports = formulas.map((formula) =>
	toFormulaReport({
		formula,
		topics: TOPIC_MATCHING_TOPICS,
		cases: TOPIC_MATCHING_CASES,
		toTopicScores,
		minimumSuggestedRelevance: MIN_SUGGESTED_TOPIC_RELEVANCE,
		minimumFiledRelevance: MIN_FILED_TOPIC_RELEVANCE,
	}),
)

// print each case's top Topics under the shipped weight, then one line per formula
for (const topicCase of TOPIC_MATCHING_CASES) {
	const shippedFormula = toWeightedFormula(TOPIC_ATTACHMENT_SCORE_WEIGHT)
	// rank the Topics and keep the top three
	const rankedLines = TOPIC_MATCHING_TOPICS.map((topic) => {
		const topicScores = toTopicScores(topicCase, topic)
		const relevance = shippedFormula.toRelevance(topicScores)
		const scoreText = `name and prompt ${topicScores.nameAndPromptScore.toFixed(3)} attachment ${topicScores.attachmentScore?.toFixed(3) ?? "-"}`
		return { relevance, line: `  ${relevance.toFixed(3)} ${topic.id.padEnd(14)} ${scoreText}` }
	})
		.toSorted((left, right) => right.relevance - left.relevance)
		.slice(0, 3)
	// print the case's label and its top Topics
	console.log(`\n${topicCase.label} (expected ${topicCase.expectedTopicIds.join(", ") || "no match"})`)
	console.log(rankedLines.map(({ line }) => line).join("\n"))
}
console.log(
	`\nminimum suggested relevance ${MIN_SUGGESTED_TOPIC_RELEVANCE}, minimum filing relevance ${MIN_FILED_TOPIC_RELEVANCE}`,
)
console.log(reports.map(toFormulaReportLine).join("\n"))
const minimumRelevanceLines = toMinimumRelevanceReportLines({
	formula: toWeightedFormula(TOPIC_ATTACHMENT_SCORE_WEIGHT),
	topics: TOPIC_MATCHING_TOPICS,
	cases: TOPIC_MATCHING_CASES,
	toTopicScores,
	minimumRelevances: MINIMUM_RELEVANCES,
})
console.log(`\nminimum relevances at weight ${TOPIC_ATTACHMENT_SCORE_WEIGHT}\n${minimumRelevanceLines.join("\n")}`)

// the eval passes if the shipped weight ranks every labeled case first, holds every decoy, and keeps every no-match
// case under the minimum suggested relevance
const shippedReport = reports.find((report) => report.name === `weight ${TOPIC_ATTACHMENT_SCORE_WEIGHT}`)
if (!shippedReport) {
	throw new Error(`The eval compares no weight of ${TOPIC_ATTACHMENT_SCORE_WEIGHT}`)
}
const noMatchPassCount =
	shippedReport.bestNoMatchScore < MIN_SUGGESTED_TOPIC_RELEVANCE ? shippedReport.noMatchCaseCount : 0
const passedRunCount = shippedReport.topMatchCount + shippedReport.decoysHeldCount + noMatchPassCount
const runCount = shippedReport.expectedCaseCount + shippedReport.decoyCount + shippedReport.noMatchCaseCount

// save the pass count and the whole report, and exit with a failure unless every check passes. CI saves nothing
if (!Bun.env.CI) {
	await saveEvalResult({
		name: "topic-matching",
		passedRunCount,
		runCount,
		ranOn: new Date().toISOString().slice(0, 10),
		...readGitState(),
		writerModelIds: ["embed-model"],
		graderModelId: "labels",
		attachmentScoreWeight: TOPIC_ATTACHMENT_SCORE_WEIGHT,
		minimumSuggestedRelevance: MIN_SUGGESTED_TOPIC_RELEVANCE,
		minimumFiledRelevance: MIN_FILED_TOPIC_RELEVANCE,
		formulaReports: reports,
		minimumRelevanceLines,
	})
}
process.exitCode = passedRunCount === runCount ? 0 : 1
