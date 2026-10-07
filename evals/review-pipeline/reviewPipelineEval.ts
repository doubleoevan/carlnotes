// the review pipeline eval runs the real review path over a labeled corpus and reports precision, recall, cost per topic,
// and the scanner's false-positive and catch rates. the eval makes real model calls and runs as a script:
//   bun run eval:review-pipeline                      measure every fixture beside this file
//   bun run eval:review-pipeline --with-examples      score with the topic's rated and bookmarked pages as examples
//   bun run eval:review-pipeline --export <topicId>   write a fixture from a public Topic, under the prd config
//   bun run eval:review-pipeline --guard-only         measure only LLM Guard's two rates, with no model spend
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { connectionPool } from "../../db"
import { charge, EMBED_COST_PER_MILLION_TOKENS, newBudget, tokenCost } from "../../worker/budget"
import { type ScreenVerdict, screenText } from "../../worker/guard"
import { embedVector } from "../../worker/models"
import {
	embedQuery,
	isRelevant,
	type Resource,
	type ScoreExamplePage,
	toScoreContextText,
} from "../../worker/review/filter"
import { isPromoted, scoreResource } from "../../worker/review/score"
import { shutdownTelemetry, startTelemetry } from "../../worker/telemetry"
import { toPercentLabel } from "../evalLabels"
import { type CachedPage, exportFixture, FIXTURES_DIRECTORY, PAGE_CACHE_DIRECTORY } from "./reviewPipelineExport"

// one labeled Resource. what an ingester would have returned, plus the label that the eval measures against
export type LabeledResource = {
	title: string | null
	url: string
	// the ingester's snippet and the page body. an exported row's snippet and body come from the page cache.
	// a written row holds its own text
	snippet?: string | null
	content?: string
	// the medium, which decides the bar the gate measures this row against. a row written without one
	// measures as an article
	kind?: Resource["kind"]
	// the label. null means unlabeled, and the eval rejects a fixture with an unlabeled Resource
	isRelevant: boolean | null
	// where the label came from: rating, bookmark, reading, or written. a reading is a person's reading of the page
	// against the topic, and a written row was written for the eval with its own text and label
	labelSource?: "rating" | "bookmark" | "reading" | "written"
}

// the fixture to measure, its name, and how to measure it. with examples, the score prompt lists the pages labeled from
// a rating or a bookmark, the way a Scan lists the topic's liked, bookmarked, and rated-down pages
type MeasureFixtureOptions = { name: string; fixture: EvalFixture; isScoredWithExamples?: boolean }

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

// pick the mode from the arguments, only if this file runs as a script
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

	// list the fixture files, and fail if there are none
	const fixtureFiles = readdirSync(FIXTURES_DIRECTORY).filter((file) => file.endsWith(".json"))
	if (fixtureFiles.length === 0) {
		console.error(
			`no fixtures in ${FIXTURES_DIRECTORY}. write one, or run: bun run eval:review-pipeline --export <topicId>`,
		)
		process.exitCode = 1
		return
	}

	// measure the fixtures one at a time. an exported row's snippet and body come from the page cache.
	// a written row holds its own text
	const isScoredWithExamples = Bun.argv.includes("--with-examples")
	const results: EvalResult[] = []
	for (const fixtureFile of fixtureFiles) {
		const fixtureName = fixtureFile.replace(/\.json$/, "")
		const fixture = JSON.parse(readFileSync(join(FIXTURES_DIRECTORY, fixtureFile), "utf8")) as EvalFixture
		const cachedFixture = toCachedFixture(fixtureName, fixture)
		results.push(await measureFixture({ name: fixtureName, fixture: cachedFixture, isScoredWithExamples }))
	}

	// print the table and close the tracing
	printResults(results)
	await shutdownTelemetry()
}

/**
 * Run one fixture's Resources through the real embed-filter and tiered scoring, then score the scanner on benign prose.
 * Exported so the eval smoke can exercise the eval on a tiny inline fixture before a real corpus is labeled.
 */
export async function measureFixture({
	name,
	fixture,
	isScoredWithExamples = false,
}: MeasureFixtureOptions): Promise<EvalResult> {
	// an unlabeled fixture would report a meaningless number, so reject it outright
	const labeledResources = fixture.labeledResources
	const unlabeledCount = labeledResources.filter((labeledResource) => labeledResource.isRelevant === null).length
	if (unlabeledCount > 0) {
		throw new Error(`${name}: ${unlabeledCount} of ${labeledResources.length} resources are unlabeled`)
	}

	// the topic embedding the relevance gate compares against, charged the way the pipeline charges it,
	// so the reported cost per topic includes it
	const budget = newBudget()
	const topicText = fixture.topic.context.trim() || fixture.topic.name
	const topicEmbedding = await embedQuery(topicText)
	charge(budget, "embedding", tokenCost(Math.ceil(topicText.length / 4), EMBED_COST_PER_MILLION_TOKENS))

	// the text that the score prompt reads. the topic's text, plus the rated and bookmarked pages with --with-examples
	const topicScoreText = isScoredWithExamples ? toExampleScoreText(topicText, labeledResources) : topicText

	// each Resource goes through the access gate, then the tiered scoring the gate's survivors would get
	const predictions: boolean[] = []
	for (const labeledResource of labeledResources) {
		predictions.push(await isPredictedRelevant(labeledResource, topicEmbedding, topicScoreText, budget))
	}

	// precision and recall against the labels, then the scanner's two rates: false positives on benign prose,
	// and the catch rate on real attacks
	const labels = labeledResources.map((labeledResource) => labeledResource.isRelevant === true)
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
	topicScoreText: string,
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
	const { score } = await scoreResource(resource.content ?? "", topicScoreText, budget)
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

	// fail the run if the scanner is unreachable
	if (!(await isScannerReachable(guardUrl))) {
		console.error(`scanner at ${guardUrl} is unreachable, so there is nothing to measure`)
		process.exitCode = 1
		return
	}

	// every fixture's benign articles and known attacks. a fixture with only one of the two sets is fine here
	const fixtureFiles = readdirSync(FIXTURES_DIRECTORY).filter((file) => file.endsWith(".json"))
	const fixtures = fixtureFiles.map(
		(fixtureFile) => JSON.parse(readFileSync(join(FIXTURES_DIRECTORY, fixtureFile), "utf8")) as EvalFixture,
	)
	const benignArticles = fixtures.flatMap((fixture) => fixture.injectionProse)
	const attacks = fixtures.flatMap((fixture) => fixture.injectionAttacks)

	// an empty corpus measures nothing, so it fails instead of passing quietly
	if (benignArticles.length === 0 && attacks.length === 0) {
		console.error(
			`no benign-injection articles or attack strings under ${FIXTURES_DIRECTORY}, so a pass here would be hollow`,
		)
		process.exitCode = 1
		return
	}

	// screen the benign articles, which discuss injection without attempting it, and print each false positive.
	// a text that the scanner could not screen, such as a text that timed out, counts on neither side
	const articleScreenTextsResult = await screenTexts(benignArticles.map((benignArticle) => benignArticle.content))
	for (const [i, screenVerdict] of articleScreenTextsResult.screenVerdicts.entries()) {
		if (screenVerdict.isFlagged) {
			console.log(`false positive: ${benignArticles[i]?.title} (${screenVerdict.detectors.join(", ")})`)
		}
	}

	// the catch-rate side: every miss here is wrong, since these are real, known attack strings
	const attackScreenTextsResult = await screenTexts(attacks)
	for (const [i, screenVerdict] of attackScreenTextsResult.screenVerdicts.entries()) {
		if (!screenVerdict.isFlagged) {
			console.log(
				`${screenVerdict.outcome === "screened" ? "missed" : "unscreened"} attack: ${attacks[i]?.slice(0, 60)}`,
			)
		}
	}

	// the two lines the ci quotes into the upgrade issue. both are printed because a scanner that flags nothing
	// would otherwise look perfect, showing 0% false positives and 0% caught at the same time
	console.log(
		`scanner false-positive rate: ${articleScreenTextsResult.flaggedCount}/${articleScreenTextsResult.screenedCount} benign articles flagged`,
	)
	console.log(
		`scanner attack catch rate: ${attackScreenTextsResult.flaggedCount}/${attackScreenTextsResult.screenedCount} known attacks caught`,
	)

	// count the texts that neither rate counts
	const unscreenedCount =
		benignArticles.length +
		attacks.length -
		articleScreenTextsResult.screenedCount -
		attackScreenTextsResult.screenedCount

	// print the count if any text went unscreened
	if (unscreenedCount > 0) {
		console.log(`${unscreenedCount} texts could not be screened, so neither rate counts them`)
	}
}

// screen each text one at a time, and count the verdicts that the scanner flagged and the texts that it screened
async function screenTexts(
	texts: string[],
): Promise<{ screenVerdicts: ScreenVerdict[]; flaggedCount: number; screenedCount: number }> {
	const screenVerdicts: ScreenVerdict[] = []
	for (const text of texts) {
		screenVerdicts.push(await screenText(text, "page"))
	}
	return {
		screenVerdicts,
		flaggedCount: screenVerdicts.filter((screenVerdict) => screenVerdict.isFlagged).length,
		screenedCount: screenVerdicts.filter((screenVerdict) => screenVerdict.outcome === "screened").length,
	}
}

// the share of the given texts that the scanner flags, or null if there is no scanner to ask. the false-positive rate
// and the catch rate both measure this way
async function toFlaggedRate(texts: string[]): Promise<number | null> {
	// with no scanner, a scanner that is down, or nothing to measure, report null instead of a zero that looks like a result
	const guardUrl = Bun.env.LLM_GUARD_URL
	if (!guardUrl || texts.length === 0 || !(await isScannerReachable(guardUrl))) {
		return null
	}

	// count only the texts that the scanner screened, and print the count of texts that the rate leaves out
	const { flaggedCount, screenedCount } = await screenTexts(texts)
	if (screenedCount < texts.length) {
		console.log(`${texts.length - screenedCount} texts could not be screened, so the rate leaves them out`)
	}
	return screenedCount === 0 ? null : flaggedCount / screenedCount
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
		const falsePositives = result.falsePositiveRate === null ? "n/a" : toPercentLabel(result.falsePositiveRate)
		const catchRate = result.attackCatchRate === null ? "n/a" : toPercentLabel(result.attackCatchRate)
		console.log(
			`| ${result.name} | ${result.resourceCount} | ${toPercentLabel(result.precision)} | ${toPercentLabel(result.recall)} | $${result.costUsd.toFixed(4)} | ${falsePositives} | ${catchRate} |`,
		)
	}
}

// the fixture with each page's snippet and body filled from the fixture's page cache. text that the fixture holds
// itself stays, and a page with no body in either place throws an error
function toCachedFixture(fixtureName: string, fixture: EvalFixture): EvalFixture {
	const pageCachePath = join(PAGE_CACHE_DIRECTORY, `${fixtureName}.json`)
	const pageCache = existsSync(pageCachePath)
		? (JSON.parse(readFileSync(pageCachePath, "utf8")) as Record<string, CachedPage>)
		: {}

	// fill each page's body, and throw an error on the first page that has no body
	const labeledResources = fixture.labeledResources.map((labeledResource) => {
		const cachedPage = pageCache[labeledResource.url]
		const content = labeledResource.content ?? cachedPage?.content
		if (content === undefined) {
			throw new Error(`${fixtureName}: no page body for ${labeledResource.url}. run --export ${fixtureName} first`)
		}

		// keep a snippet that the fixture holds itself, and fall back to the cached snippet
		return { ...labeledResource, snippet: labeledResource.snippet ?? cachedPage?.snippet ?? null, content }
	})
	return { ...fixture, labeledResources }
}

// the topic's text with the example pages. the pages that a rating or a bookmark labeled relevant,
// and the pages that a rating labeled not relevant
function toExampleScoreText(topicText: string, labeledResources: LabeledResource[]): string {
	const ratedOrBookmarkedResources = labeledResources.filter(
		(labeledResource) => labeledResource.labelSource === "rating" || labeledResource.labelSource === "bookmark",
	)
	const toScoreExamplePage = ({ title, url }: LabeledResource): ScoreExamplePage => ({ title, url })
	return toScoreContextText(topicText, {
		likedOrBookmarkedPages: ratedOrBookmarkedResources.filter(({ isRelevant }) => isRelevant).map(toScoreExamplePage),
		ratedDownPages: ratedOrBookmarkedResources.filter(({ isRelevant }) => isRelevant === false).map(toScoreExamplePage),
	})
}

// whether the scanner responds to a probe request
async function isScannerReachable(guardUrl: string): Promise<boolean> {
	const probeResponse = await fetch(`${guardUrl}/analyze/prompt`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ prompt: "reachability probe" }),
	}).catch(() => null)
	return Boolean(probeResponse?.ok)
}
