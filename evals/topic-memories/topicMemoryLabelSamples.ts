// samples committed exact combines and the same reversible groups the app reads
import { randomInt } from "node:crypto"
import { toNamedTopicMemoryText } from "@carlnotes/contracts/topicMemories"
import { db } from "@carlnotes/db"
import { topicMemories, topicMemoryDecisions } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import { groupTopicMemories } from "@carlnotes/db/topicMemoryGroups"
import { and, eq, isNotNull } from "drizzle-orm"
import { labelTopicMemoryPairs, toThresholdMetrics } from "./topicMemoryPairJudge"

type LabelSample = {
	id: string
	a: string
	b: string
	aFactDate: string | null
	bFactDate: string | null
	action: "combined" | "grouped"
}
type LabelDataset = {
	samples: LabelSample[]
	judge: Record<string, boolean>
	eligible: { combined: number; grouped: number }
}

// keep the human review to the requested size for each prediction class
const PER_ACTION = 50

/** Reads only public Topic material and samples each action without replacement. */
export async function sampleTopicMemoryLabels(apiKey: string): Promise<LabelDataset> {
	// same-value exact decisions are immutable and include both original statements
	const [decisions, rows] = await Promise.all([
		db
			.select({
				topicId: topicMemories.topicId,
				a: topicMemoryDecisions.candidateText,
				b: topicMemoryDecisions.matchText,
				factDate: topicMemories.factDate,
			})
			.from(topicMemoryDecisions)
			.innerJoin(topicMemories, eq(topicMemories.id, topicMemoryDecisions.memoryId))
			.innerJoin(topics, eq(topics.id, topicMemories.topicId))
			.where(
				and(
					eq(topics.visibility, "public"),
					eq(topicMemoryDecisions.kind, "merge"),
					eq(topicMemoryDecisions.source, "exact"),
					isNotNull(topicMemoryDecisions.candidateText),
					isNotNull(topicMemoryDecisions.matchText),
				),
			),
		db
			.select({
				id: topicMemories.id,
				topicId: topicMemories.topicId,
				subject: topicMemories.subject,
				claimType: topicMemories.claimType,
				value: topicMemories.value,
				factDate: topicMemories.factDate,
				text: topicMemories.text,
				person: topicMemories.person,
				embedding: topicMemories.embedding,
				embeddingModel: topicMemories.embeddingModel,
			})
			.from(topicMemories)
			.innerJoin(topics, eq(topics.id, topicMemories.topicId))
			.where(
				and(
					eq(topics.visibility, "public"),
					eq(topicMemories.status, "active"),
					eq(topicMemories.isAtomic, true),
					isNotNull(topicMemories.subject),
				),
			),
	])
	// repeated replays of one unordered pair contribute only one labeling example
	const combinedByPair = new Map<string, Omit<LabelSample, "id" | "action">>()
	for (const { topicId, a, b, factDate } of decisions) {
		if (a && b) {
			const texts = [a, b].map((text) => text.trim().toLowerCase().replace(/\s+/g, " ")).sort()
			combinedByPair.set(JSON.stringify([topicId, factDate, texts]), { a, b, aFactDate: factDate, bFactDate: factDate })
		}
	}
	const combined = [...combinedByPair.values()]

	// group rows within one Topic at a time, using the production rule
	const namedRows = rows.flatMap((row) => {
		const text = toNamedTopicMemoryText(row.text, row.person)
		return text ? [{ ...row, text }] : []
	})
	const topicsById = Map.groupBy(namedRows, ({ topicId }) => topicId)
	const grouped = [...topicsById.values()].flatMap((memories) =>
		groupTopicMemories(memories).flatMap((group) =>
			group.flatMap((left, index) =>
				group.slice(index + 1).map((right) => ({
					a: left.text,
					b: right.text,
					aFactDate: left.factDate,
					bFactDate: right.factDate,
				})),
			),
		),
	)
	const samples = shuffle([...toSamples(combined, "combined"), ...toSamples(grouped, "grouped")])
	const judge = await labelTopicMemoryPairs(
		samples.map(({ action: _action, ...pair }) => pair),
		apiKey,
	)
	return { samples, judge: Object.fromEntries(judge), eligible: { combined: combined.length, grouped: grouped.length } }
}

// assign opaque IDs before interleaving the two sample strata
function toSamples(pairs: Omit<LabelSample, "id" | "action">[], action: LabelSample["action"]): LabelSample[] {
	return shuffle(pairs)
		.slice(0, PER_ACTION)
		.map((pair) => ({ ...pair, id: crypto.randomUUID(), action }))
}

function shuffle<Item>(input: Item[]): Item[] {
	// independent random positions without mutating the caller's list
	const result = input.slice()
	for (let index = result.length - 1; index > 0; index--) {
		const swap = randomInt(index + 1)
		const item = result[index] as Item
		result[index] = result[swap] as Item
		result[swap] = item
	}
	return result
}

/** Measures each action against human and judge labels among only the sampled pairs. */
export function scoreTopicMemoryLabels(dataset: LabelDataset, human: Record<string, boolean>) {
	// omit unlabelled pairs from all denominators
	const score = (labels: Record<string, boolean>, action: LabelSample["action"]) => {
		const labelled = dataset.samples.filter(({ id }) => typeof labels[id] === "boolean")
		const truePositive = labelled.filter(({ id, action: predicted }) => labels[id] && predicted === action).length
		const result = toThresholdMetrics({
			truePositive,
			falsePositive: labelled.filter(({ id, action: predicted }) => !labels[id] && predicted === action).length,
			falseNegative: labelled.filter(({ id, action: predicted }) => labels[id] && predicted !== action).length,
		})
		// a sample with only one predicted action cannot characterize missed pairs
		return labelled.some(({ action: predicted }) => predicted !== action) &&
			labelled.some(({ action: predicted }) => predicted === action)
			? result
			: { ...result, recall: null }
	}
	const matching = dataset.samples.filter(
		({ id }) => typeof human[id] === "boolean" && typeof dataset.judge[id] === "boolean",
	)
	const agreements = matching.filter(({ id }) => human[id] === dataset.judge[id]).length
	return {
		eligible: dataset.eligible,
		sampled: {
			combined: dataset.samples.filter(({ action }) => action === "combined").length,
			grouped: dataset.samples.filter(({ action }) => action === "grouped").length,
		},
		labels: matching.length,
		human: { combined: score(human, "combined"), grouped: score(human, "grouped") },
		judge: { combined: score(dataset.judge, "combined"), grouped: score(dataset.judge, "grouped") },
		agreement: { agreements, compared: matching.length, rate: matching.length ? agreements / matching.length : null },
	}
}
