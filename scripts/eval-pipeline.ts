// the eval harness. it runs the real review path over a labeled corpus and reports precision, recall, and cost
// per topic, plus how often the scanner flags a benign article and how often it catches a real attack.
//
// it spends real money, so it is a script instead of a test and never runs in the push gate:
//   bun run eval                      measure every fixture under evals/
//   bun run eval --export <topicId>   write an unlabeled fixture from a real Topic's Resources, for labeling
//   bun run eval --guard-only         measure only LLM Guard's two rates; no model calls, no spend
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { and, desc, eq, isNotNull } from "drizzle-orm"
import { connectionPool, db } from "../db"
import { resources, topics } from "../db/schema"
import { buildTopicScanContext } from "../worker/attach"
import { charge, EMBED_COST_PER_MILLION_TOKENS, newBudget, tokenCost } from "../worker/budget"
import { screenText } from "../worker/guard"
import { embedVector } from "../worker/models"
import { embedQuery, isRelevant, type Resource } from "../worker/review/filter"
import { isPromoted, scoreResource } from "../worker/review/score"
import { getResourceContent } from "../worker/store"
import { shutdownTelemetry, startTelemetry } from "../worker/telemetry"

// where the fixtures live, and how many Resources an export pulls
const EVALS_DIRECTORY = join(import.meta.dir, "..", "evals")
const EXPORT_RESOURCE_COUNT = 50

// one labeled Resource: what an ingester would have returned, plus the human judgment the harness measures against
type LabeledResource = {
	title: string | null
	url: string
	snippet: string | null
	content: string
	// the medium, which decides the bar the gate measures this row against. a row written without one
	// measures as an article
	kind?: Resource["kind"]
	// the label. null means unlabeled, which the harness refuses to measure
	isRelevant: boolean | null
}

// one topic's fixture: its context, its labeled Resources, articles that discuss injection in benign prose, and
// known attack strings the scanner should catch. exported so the eval smoke can run one tiny fixture end-to-end
export type EvalFixture = {
	topic: { name: string; context: string }
	labeledResources: LabeledResource[]
	injectionProse: { title: string; url: string; content: string }[]
	// public, well-known injection payloads. every one the scanner misses is a miss the false-positive rate cannot show,
	// since a scanner that flags nothing scores a perfect 0% there
	injectionAttacks: string[]
}

// what one fixture's run produced. the two scanner rates are null together, only if no scanner is configured
type EvalResult = {
	name: string
	precision: number
	recall: number
	costUsd: number
	resourceCount: number
	// the share of benign articles the scanner flagged. every flag here is wrong and narrows what a user sees
	falsePositiveRate: number | null
	// the share of real attacks the scanner caught. read it beside the rate above,
	// since a scanner that flags nothing scores a perfect false-positive rate while catching nothing
	attackCatchRate: number | null
}

// pick the mode from the arguments. guarded so importing this file for its exported math runs nothing and opens no database connection
if (import.meta.main) {
	const exportTopicId = Bun.argv.includes("--export") ? Bun.argv[Bun.argv.indexOf("--export") + 1] : undefined

	// guard-only is what the ci runs, export writes a fixture to label, and the default measures the whole pipeline
	if (Bun.argv.includes("--guard-only")) {
		await measureGuardOnly()
	} else if (exportTopicId) {
		await exportFixture(exportTopicId)
	} else {
		await measureFixtures()
	}

	// close the pool so the run exits instead of hanging on to an idle connection
	await connectionPool.end()
}

// run every fixture and print the table the README includes
async function measureFixtures(): Promise<void> {
	// turn on tracing, so an eval run shows up in Langfuse like a Scan does
	startTelemetry()
	const fixtureFiles = readdirSync(EVALS_DIRECTORY).filter((file) => file.endsWith(".json"))
	if (fixtureFiles.length === 0) {
		console.error(`no fixtures in ${EVALS_DIRECTORY}. write one, or run: bun run eval --export <topicId>`)
		process.exitCode = 1
		return
	}

	// measure one fixture at a time, since each one spends money
	const results: EvalResult[] = []
	for (const fixtureFile of fixtureFiles) {
		const fixture = JSON.parse(readFileSync(join(EVALS_DIRECTORY, fixtureFile), "utf8")) as EvalFixture
		results.push(await measureFixture(fixtureFile.replace(/\.json$/, ""), fixture))
	}
	printResults(results)
	await shutdownTelemetry()
}

/**
 * Run one fixture's Resources through the real embed-filter and tiered scoring, then score the scanner on benign prose.
 * Exported so the eval smoke can exercise the harness on a tiny inline fixture before a real corpus is labeled.
 */
export async function measureFixture(name: string, fixture: EvalFixture): Promise<EvalResult> {
	// an unlabeled fixture would report a meaningless number, so reject it outright
	const labeledResources = fixture.labeledResources
	const unlabeledCount = labeledResources.filter((labeled) => labeled.isRelevant === null).length
	if (unlabeledCount > 0) {
		throw new Error(`${name}: ${unlabeledCount} of ${labeledResources.length} resources are unlabeled`)
	}

	// the topic embedding the relevance gate compares against, charged the way the pipeline charges it,
	// so the reported cost per topic includes it
	const budget = newBudget()
	const topicText = fixture.topic.context.trim() || fixture.topic.name
	const topicEmbedding = await embedQuery(topicText)
	charge(budget, "embedding", tokenCost(Math.ceil(topicText.length / 4), EMBED_COST_PER_MILLION_TOKENS))

	// each Resource goes through the access gate, then the tiered scoring the gate's survivors would get
	const predictions: boolean[] = []
	for (const labeled of labeledResources) {
		predictions.push(await isPredictedRelevant(labeled, topicEmbedding, topicText, budget))
	}

	// precision and recall against the labels, then the scanner's two rates: false positives on benign prose,
	// and the catch rate on real attacks
	const labels = labeledResources.map((labeled) => labeled.isRelevant === true)
	return {
		name,
		...toPrecisionRecall(predictions, labels),
		costUsd: budget.spentDollars,
		resourceCount: labeledResources.length,
		falsePositiveRate: await toFlaggedRate(fixture.injectionProse.map((article) => article.content)),
		attackCatchRate: await toFlaggedRate(fixture.injectionAttacks),
	}
}

// whether the pipeline should surface this Resource: it clears the relevance gate and then scores high enough to promote
async function isPredictedRelevant(
	resource: LabeledResource,
	topicEmbedding: number[],
	topicText: string,
	budget: ReturnType<typeof newBudget>,
): Promise<boolean> {
	// the gate first, exactly as a Scan runs it, charging the embedding the way the pipeline does
	const documentText = `${resource.title ?? ""}\n${resource.snippet ?? ""}`.trim() || resource.url
	const embedding = await embedVector(documentText)
	charge(budget, "embedding", tokenCost(Math.ceil(documentText.length / 4), EMBED_COST_PER_MILLION_TOKENS))
	const similarity = toCosineSimilarity(embedding, topicEmbedding)

	// filter with the cheap model against the bar for this resource kind, since a video clears a lower bar than an article
	if (!isRelevant(similarity, resource.kind ?? "read")) {
		return false
	}

	// then the paid tiered scoring promotion threshold separates a kept Finding from a filtered one
	const { score } = await scoreResource(resource.content, topicText, budget)
	return isPromoted(score)
}

// measure only LLM Guard's false-positive rate and attack catch rate: no model calls, no spend.
// these are the two numbers a version bump changes, so the weekly ci check measures a candidate container with them
async function measureGuardOnly(): Promise<void> {
	// the goal is measuring the guard, so a missing url is a failed run, not a skipped one
	const guardUrl = Bun.env.LLM_GUARD_URL
	if (!guardUrl) {
		console.error("LLM_GUARD_URL must be set for --guard-only, since LLM Guard is what it measures")
		process.exitCode = 1
		return
	}

	// screenText leaves text unflagged when the scanner is down, so check that it answers before measuring it.
	// otherwise every article passes and the run reports a perfect score that it didn't earn
	const probeResponse = await fetch(`${guardUrl}/analyze/prompt`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ prompt: "reachability probe" }),
	}).catch(() => null)
	if (!probeResponse?.ok) {
		console.error(`scanner at ${guardUrl} is unreachable, so there is nothing to measure`)
		process.exitCode = 1
		return
	}

	// every fixture's benign articles and known attacks. a fixture with only one of the two sets is fine here
	const fixtureFiles = readdirSync(EVALS_DIRECTORY).filter((file) => file.endsWith(".json"))
	const fixtures = fixtureFiles.map(
		(fixtureFile) => JSON.parse(readFileSync(join(EVALS_DIRECTORY, fixtureFile), "utf8")) as EvalFixture,
	)
	const benignArticles = fixtures.flatMap((fixture) => fixture.injectionProse)
	const attacks = fixtures.flatMap((fixture) => fixture.injectionAttacks)

	// an empty corpus measures nothing, so it fails instead of passing quietly
	if (benignArticles.length === 0 && attacks.length === 0) {
		console.error(
			`no benign-injection articles or attack strings under ${EVALS_DIRECTORY}, so a pass here would be hollow`,
		)
		process.exitCode = 1
		return
	}

	// the false-positive side: every flag here is wrong, since these articles discuss injection instead of actually attempting it
	let flaggedCount = 0
	for (const benignArticle of benignArticles) {
		const screenVerdict = await screenText(benignArticle.content, "page")
		if (screenVerdict.isFlagged) {
			flaggedCount++
			console.log(`false positive: ${benignArticle.title} (${screenVerdict.detectors.join(", ")})`)
		}
	}

	// the catch-rate side: every miss here is wrong, since these are real, known attack strings
	let caughtCount = 0
	for (const attack of attacks) {
		const screenVerdict = await screenText(attack, "page")
		// count a catch, or name what got past the scanner
		if (screenVerdict.isFlagged) {
			caughtCount++
		} else {
			console.log(`missed attack: ${attack.slice(0, 60)}`)
		}
	}

	// the two lines the ci quotes into the upgrade issue. both are printed because a scanner that flags nothing
	// would otherwise look perfect, showing 0% false positives and 0% caught at the same time
	console.log(`scanner false-positive rate: ${flaggedCount}/${benignArticles.length} benign articles flagged`)
	console.log(`scanner attack catch rate: ${caughtCount}/${attacks.length} known attacks caught`)
}

// the share of the given texts the scanner flags, or null if there is no scanner to ask. both rates use this:
// on benign articles a flag is wrong, on real attacks a miss is wrong, but the measurement is the same
async function toFlaggedRate(texts: string[]): Promise<number | null> {
	// with no scanner or nothing to measure, report null instead of a zero that looks like a result
	if (!Bun.env.LLM_GUARD_URL || texts.length === 0) {
		return null
	}
	const verdicts = await Promise.all(texts.map((text) => screenText(text, "page")))
	return verdicts.filter((verdict) => verdict.isFlagged).length / verdicts.length
}

/**
 * Precision and recall of the predictions against the labels. An empty denominator reports 0 instead of NaN.
 */
export function toPrecisionRecall(predictions: boolean[], labels: boolean[]): { precision: number; recall: number } {
	// the three counts the two ratios need
	const truePositives = predictions.filter((prediction, index) => prediction && labels[index]).length
	const predictedCount = predictions.filter(Boolean).length
	const labeledCount = labels.filter(Boolean).length
	return {
		precision: predictedCount === 0 ? 0 : truePositives / predictedCount,
		recall: labeledCount === 0 ? 0 : truePositives / labeledCount,
	}
}

// cosine similarity between two embeddings, the same measure the relevance gate applies
function toCosineSimilarity(resourceEmbedding: number[], topicEmbedding: number[]): number {
	// both vectors are l2-normalized by the embedding helper, so the dot product is the cosine
	return resourceEmbedding.reduce((sum, value, index) => sum + value * (topicEmbedding[index] ?? 0), 0)
}

// print the results as the Markdown table the README includes
function printResults(results: EvalResult[]): void {
	console.log("\n| topic | resources | precision | recall | cost | scanner false positives | scanner catch rate |")
	console.log("|---|---|---|---|---|---|---|")
	for (const result of results) {
		// null reads as n/a instead of a misleadingly blank cell
		const falsePositives = result.falsePositiveRate === null ? "n/a" : toPercent(result.falsePositiveRate)
		const catchRate = result.attackCatchRate === null ? "n/a" : toPercent(result.attackCatchRate)
		console.log(
			`| ${result.name} | ${result.resourceCount} | ${toPercent(result.precision)} | ${toPercent(result.recall)} | $${result.costUsd.toFixed(4)} | ${falsePositives} | ${catchRate} |`,
		)
	}
}

// a ratio as a whole-number percentage
function toPercent(ratio: number): string {
	return `${Math.round(ratio * 100)}%`
}

// write an unlabeled fixture from real data, so labeling is a human pass
// the Topic gives the context and the newest stored Resources fill the corpus
async function exportFixture(topicId: string): Promise<void> {
	// the topic's own effective context, the same text a Scan would compare against
	const [topic] = await db.select({ name: topics.name }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`topic ${topicId} not found`)
	}
	const { context } = await buildTopicScanContext(topicId)

	// the newest Resources holding an embedding and stored content, which is what a Scan would have judged.
	// Resources are global instead of topic-scoped, so these are not only the ones this Topic surfaced
	const resourceRows = await db
		.select({
			title: resources.title,
			url: resources.url,
			snippet: resources.snippet,
			kind: resources.kind,
			contentKey: resources.contentKey,
		})
		.from(resources)
		.where(and(isNotNull(resources.embedding), isNotNull(resources.contentKey)))
		.orderBy(desc(resources.createdAt))
		.limit(EXPORT_RESOURCE_COUNT)

	// read each one's stored body, so the fixture scores the same text a Scan would
	const labeledResources: LabeledResource[] = []
	for (const resourceRow of resourceRows) {
		const content = resourceRow.contentKey ? await getResourceContent(resourceRow.contentKey).catch(() => "") : ""
		labeledResources.push({
			title: resourceRow.title,
			url: resourceRow.url,
			snippet: resourceRow.snippet,
			kind: resourceRow.kind,
			content,
			isRelevant: null,
		})
	}

	// write it out for a human to label, with the prose and attack sets empty to fill in by hand
	const fixture: EvalFixture = {
		topic: { name: topic.name, context },
		labeledResources,
		injectionProse: [],
		injectionAttacks: [],
	}
	const fixturePath = join(EVALS_DIRECTORY, `${topicId}.json`)
	writeFileSync(fixturePath, `${JSON.stringify(fixture, null, "\t")}\n`)
	console.log(`wrote ${labeledResources.length} unlabeled resources to ${fixturePath}`)
	console.log("label each isRelevant, add benign injection prose, and a set of known attack strings")
}
