// labels pairs without exposing any cosine scores or cutoff values to the grader

import { toChunks } from "@carlnotes/contracts/arrays"
import type { TopicMemoryPerson } from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_MERGE_SIMILARITY, TOPIC_MEMORY_REVIEW_SIMILARITY } from "@carlnotes/contracts/topicMemoryWork"
import { LOW_REASONING_PROVIDER_OPTIONS, SCORE_OUTPUT_TOKENS, scoreModel } from "@carlnotes/models/models"
import { fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { toLinkedTopicMemoryGroups, toTopicMemorySimilarity } from "@carlnotes/pipeline/topicMemoryOperations"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { generateText, Output } from "ai"
import { z } from "zod"

const JUDGE_COSINE_FLOOR = 0.8
const EVAL_THRESHOLDS = [TOPIC_MEMORY_REVIEW_SIMILARITY, 0.85, 0.92, 0.94, 0.95, 0.96, TOPIC_MEMORY_MERGE_SIMILARITY]
const JUDGE_BATCH_SIZE = 8
const CONCURRENT_JUDGE_BATCHES = 4
const verdicts = z.object({ pairs: z.array(z.object({ id: z.string(), duplicate: z.boolean() })) })

export type Takeaway = {
	text: string
	embedding: number[]
	memoryId?: string
	factDate?: string | null
	person?: TopicMemoryPerson | null
}
type Pair = { id: string; left: number; right: number; cosine: number; combined: boolean }
type JudgedPair = {
	id: string
	stage: "before" | "after"
	cosine: number
	duplicate: boolean
	combined: boolean
	a: string | undefined
	b: string | undefined
	aFactDate?: string | null
	bFactDate?: string | null
	aPerson?: TopicMemoryPerson | null
	bPerson?: TopicMemoryPerson | null
}
type ThresholdCounts = { truePositive: number; falsePositive: number; falseNegative: number }
type ThresholdMetrics = ThresholdCounts & { precision: number | null; recall: number | null }
type JudgedStage = {
	memoryCount: number
	allPairs: number
	judgedPairs: number
	duplicatePairs: number
	duplicateRows: number
	duplicateRate: number
	thresholds: ({ threshold: number } & ThresholdMetrics)[]
}

export async function judgeTakeaways({
	before,
	after,
	apiKey,
}: {
	before: Takeaway[]
	after: Takeaway[]
	apiKey: string
}): Promise<{
	before: JudgedStage
	after: JudgedStage
	judgeComparisons: number
	pairs: JudgedPair[]
	pipeline: ThresholdMetrics
}> {
	// grade every pair in both populations. ids carry no ranking or cosine information
	const beforePairs = toCandidatePairs(before, "a")
	const afterPairs = toCandidatePairs(after, "b")
	const texts = [...toPairTexts(before, beforePairs), ...toPairTexts(after, afterPairs)]
	const batches = toChunks(texts, JUDGE_BATCH_SIZE)
	const { template, name, registryPrompt } = await fetchPromptTemplate("judge-topic-memory-duplicates")
	const labels = new Map<string, boolean>()
	await runWithConcurrency(batches, CONCURRENT_JUDGE_BATCHES, (pairs) => gradeBatch(pairs))

	// retry a malformed or incomplete batch at a smaller size before dropping a Topic
	async function gradeBatch(pairs: typeof texts, canRetry = true): Promise<void> {
		try {
			const graded = await readBatch(pairs)
			for (const { id, duplicate } of graded) {
				labels.set(id, duplicate)
			}
		} catch (error) {
			if (!canRetry && pairs.length === 1) {
				throw error
			}
			for (const smaller of toChunks(pairs, Math.max(1, Math.ceil(pairs.length / 2)))) {
				await gradeBatch(smaller, false)
			}
		}
	}

	async function readBatch(pairs: typeof texts): Promise<z.infer<typeof verdicts>["pairs"]> {
		const prompt = writePrompt(template, { pairs: JSON.stringify(pairs) })
		const { output } = await generateText({
			model: scoreModel(apiKey),
			prompt,
			output: Output.object({ schema: verdicts }),
			maxOutputTokens: SCORE_OUTPUT_TOKENS,
			providerOptions: LOW_REASONING_PROVIDER_OPTIONS,
			...promptTelemetry({ prompt, name, registryPrompt }),
		})
		// missing or extra verdicts invalidate the batch. every candidate pair needs a label
		const expected = new Set(pairs.map(({ id }) => id))
		for (const { id } of output.pairs) {
			if (!expected.delete(id)) {
				throw new Error("The duplicate judge returned an unexpected or repeated pair")
			}
		}
		if (expected.size) {
			throw new Error(`The duplicate judge missed ${expected.size} pairs`)
		}
		return output.pairs
	}

	return {
		before: summarize(before, beforePairs, labels),
		after: summarize(after, afterPairs, labels),
		judgeComparisons: labels.size,
		pipeline: scorePipeline(beforePairs, labels),
		pairs: [
			...toJudgedPairs(before, beforePairs, labels, "before"),
			...toJudgedPairs(after, afterPairs, labels, "after"),
		],
	}
}

// keep the independent labels and their actual input texts for audit and further threshold sweeps
function toJudgedPairs(
	rows: Takeaway[],
	pairs: Pair[],
	labels: Map<string, boolean>,
	stage: JudgedPair["stage"],
): JudgedPair[] {
	return pairs.map(({ id, left, right, cosine, combined }) => ({
		id,
		stage,
		cosine,
		combined,
		duplicate: labels.get(id) === true,
		a: rows[left]?.text,
		b: rows[right]?.text,
		aFactDate: rows[left]?.factDate,
		bFactDate: rows[right]?.factDate,
		aPerson: rows[left]?.person,
		bPerson: rows[right]?.person,
	}))
}

function toCandidatePairs(rows: Takeaway[], prefix: string): Pair[] {
	const pairs: Pair[] = []
	for (const [right, second] of rows.entries()) {
		for (let left = 0; left < right; left++) {
			const first = rows[left]
			if (first) {
				const cosine = toTopicMemorySimilarity(first.embedding, second.embedding)
				// judge every real combination, even a model merge below the vector sweep
				const combined = Boolean(first.memoryId && first.memoryId === second.memoryId)
				if (cosine > JUDGE_COSINE_FLOOR || combined) {
					const id = `${prefix}${pairs.length + 1}`
					pairs.push({ id, left, right, cosine, combined })
				}
			}
		}
	}
	return pairs
}

function scorePipeline(pairs: Pair[], labels: Map<string, boolean>): ThresholdMetrics {
	// we know actual survivors from stored evidence, including after periodic cleanup
	const counts = { truePositive: 0, falsePositive: 0, falseNegative: 0 }
	for (const { id, combined } of pairs) {
		if (labels.get(id)) {
			if (combined) {
				counts.truePositive++
			} else {
				counts.falseNegative++
			}
		} else if (combined) {
			counts.falsePositive++
		}
	}
	return toThresholdMetrics(counts)
}

function toPairTexts(
	rows: Takeaway[],
	pairs: Pair[],
): Omit<JudgedPair, "stage" | "duplicate" | "combined" | "cosine">[] {
	return pairs.map(({ id, left, right }) => ({
		id,
		a: rows[left]?.text,
		b: rows[right]?.text,
		aFactDate: rows[left]?.factDate,
		bFactDate: rows[right]?.factDate,
		aPerson: rows[left]?.person,
		bPerson: rows[right]?.person,
	}))
}

function summarize(rows: Takeaway[], pairs: Pair[], labels: Map<string, boolean>): JudgedStage {
	// count redundant rows by the connected components of positively labelled pairs
	const positivePairs = pairs.filter(({ id }) => labels.get(id) === true)
	const links = new Set(positivePairs.map(({ left, right }) => `${left}:${right}`))
	const groups = toLinkedTopicMemoryGroups(
		rows.map((_, index) => index),
		(left, right) => links.has(`${Math.min(left, right)}:${Math.max(left, right)}`),
	)
	const duplicateRows = rows.length - groups.length
	return {
		memoryCount: rows.length,
		allPairs: (rows.length * (rows.length - 1)) / 2,
		judgedPairs: pairs.length,
		duplicatePairs: positivePairs.length,
		duplicateRows,
		duplicateRate: rows.length ? duplicateRows / rows.length : 0,
		thresholds: EVAL_THRESHOLDS.map((threshold) => {
			const truePositive = positivePairs.filter(({ cosine }) => cosine >= threshold).length
			const predictions = pairs.filter(({ cosine }) => cosine >= threshold).length
			return {
				threshold,
				...toThresholdMetrics({
					truePositive,
					falsePositive: predictions - truePositive,
					falseNegative: positivePairs.length - truePositive,
				}),
			}
		}),
	}
}

export function toThresholdMetrics({ truePositive, falsePositive, falseNegative }: ThresholdCounts): ThresholdMetrics {
	const predicted = truePositive + falsePositive
	const labelled = truePositive + falseNegative
	return {
		truePositive,
		falsePositive,
		falseNegative,
		precision: predicted ? truePositive / predicted : null,
		recall: labelled ? truePositive / labelled : null,
	}
}
