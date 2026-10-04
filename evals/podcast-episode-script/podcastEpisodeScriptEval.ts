// the promptfoo eval of the podcast episode script writer. every case makes real calls on the local LiteLLM proxy.
// the calls cost real money, so the eval is never part of bun test. run it with: bun run eval:podcast-episode-script
import {
	PODCAST_EPISODE_DESCRIPTION_MAX_CHARS,
	PODCAST_EPISODE_TITLE_MAX_CHARS,
	type PodcastEpisodeChapterScript,
} from "@shared/contracts"
import {
	type Assertion,
	type AssertionValueFunctionContext,
	type EvaluateResult,
	evaluate,
	type GradingResult,
	type TestCase,
} from "promptfoo"
import {
	MAX_PODCAST_EPISODE_MINUTES,
	type PodcastEpisodeSegment,
	RejectedScriptError,
	toCheckedPodcastEpisodeOutline,
	toCheckedPodcastEpisodeSegment,
	toScriptMinutes,
} from "../../worker/podcast/podcastEpisodeScript"
import { PODCAST_EPISODE_SCRIPT_CASES, type PodcastEpisodeScriptCase } from "./podcastEpisodeScriptCases"
import {
	type PodcastEpisodeScriptVariables,
	podcastEpisodeScriptWriter,
	rubricGrader,
	type WrittenPodcastEpisode,
} from "./podcastEpisodeScriptProviders"

// turn the prompt registry off. the eval measures the bundled templates in git.
// turn promptfoo's own usage telemetry off too
delete Bun.env.LANGFUSE_PUBLIC_KEY
Bun.env.PROMPTFOO_DISABLE_TELEMETRY = "true"

// a script from a thin input has to run under this many minutes
const MAX_THIN_PODCAST_EPISODE_MINUTES = 7

// where the full results are written, for reading a script after a check fails. logs/ is gitignored
const RESULTS_PATH = "logs/eval-podcast-episode-script.json"

// what every rubric tells the grader about the writer's output
const OUTPUT_SHAPE_RUBRIC =
	"The output is one podcast episode as JSON: an outline with the title and the description, and a script of two hosts' turns in chapters, each chapter citing one finding by its id."

// the rubric that fails a script for stating a fact that the Findings and their stored content do not support
const SUPPORT_RUBRIC = [
	"Every factual specific a host states is supported by the source material below.",
	"A factual specific is a name, a number, a date, a price, a quotation, or an event.",
	"Fail the output if a host states a factual specific that the source material does not have, or one that contradicts it.",
	"Never fail the output for a host's reaction, opinion, joke, or question, for everyday reasoning about what the source material says, for a number rounded or said the way a person says it, or for the show's own words.",
	"The show is Coffee Break, the carlnotes.com podcast, and its hosts are Carl and Vienna. The cold open may name the show, carlnotes.com, and the hosts, and a host may mention Carl's backstory: he never sleeps, drinks coffee, reads everything, finished the internet, and holds a raccoon and a machine learning textbook in his picture, or Vienna's: she is interested in everything, has more interests than hours in the day, a stack of half-read books, and a new obsession every week, and follows her topics on CarlNotes. The show closes on its fixed goodbye, in which Carl has more reading to do, Vienna says he always does, Carl calls it another great coffee break, Vienna asks whether it was as good for him as it was for her, Carl says not in front of the Raccoon, and Vienna says see you next coffee break.",
].join(" ")

// the rubric that fails a chapter for copying its source or for a quote with no named source.
// the writer's own checks count the quotes
const QUOTE_RUBRIC = [
	"Each chapter retells its finding's stored content in the hosts' own words.",
	"Fail the output if most of a chapter's turns are sentences of the stored content copied word for word.",
	"Fail the output if a turn quotes the stored content inside double quotation marks and that turn does not say who said it or who published it.",
	"A chapter with no quotation passes.",
	"How many quotations a chapter has is checked elsewhere, so never fail the output for their number.",
	"A name, a number, or a short phrase repeated from the stored content is not a copied sentence.",
].join(" ")

// the rubric that fails a title or a description that is not specific to the podcast episode's chapters
const TITLE_RUBRIC = [
	"The outline's title and description are specific to this episode's chapters.",
	"Someone who reads them knows what these chapters cover, and neither would fit an episode about other findings on the same topic.",
	"Fail the output if the title is the topic's name alone, is clickbait, or names nothing that a chapter covers, or if the description names nothing that a chapter covers.",
	"Fail the output if the title or the description is cut off in the middle of a sentence or a word.",
].join(" ")

// the checks that every case gets and that need no model
const DETERMINISTIC_ASSERTIONS: Assertion[] = [
	{ type: "javascript", metric: "every chapter cites an input finding", value: gradeCitedFindings },
	{ type: "javascript", metric: "the writer's own checks pass", value: gradeWriterChecks },
	{
		type: "javascript",
		metric: "the title and the description are within length",
		value: gradeTitleAndDescriptionLength,
	},
	{
		type: "javascript",
		metric: `the script is within ${MAX_PODCAST_EPISODE_MINUTES} minutes`,
		value: gradeRunningTime,
	},
]

// run every case, four at a time, with nothing saved to promptfoo's own database
const evalRecord = await evaluate(
	{
		description: "episode script writer",
		// the writer builds its own prompts from a case's variables, so this prompt only labels the run
		prompts: ["an episode for {{topicName}}"],
		providers: [podcastEpisodeScriptWriter],
		// every case's grader and its checks that need no model. a list in a case's variables stays one value
		defaultTest: {
			options: { provider: rubricGrader, disableVarExpansion: true },
			assert: DETERMINISTIC_ASSERTIONS,
		},
		tests: PODCAST_EPISODE_SCRIPT_CASES.map(toTestCase),
		writeLatestResults: false,
	},
	{ cache: false, maxConcurrency: 4 },
)

// save the full results, print the report, and fail the run if any case failed or broke
const evaluateSummary = await evalRecord.toEvaluateSummary()
await Bun.write(RESULTS_PATH, JSON.stringify(evaluateSummary, null, 2))
printReport(evaluateSummary.results)
const { successes: successCount, failures: failureCount, errors: errorCount, tokenUsage } = evaluateSummary.stats
console.log(
	`\n${successCount} passed, ${failureCount} failed, ${errorCount} broke.`,
	`grading used ${tokenUsage.assertions?.total} tokens`,
)
console.log(`full results: ${RESULTS_PATH}`)
process.exitCode = failureCount + errorCount > 0 ? 1 : 0

// one promptfoo test for a case. its variables, the rubrics over its source material,
// and the short-script check if its input is thin
function toTestCase(podcastEpisodeScriptCase: PodcastEpisodeScriptCase): TestCase {
	const { description, unsupportedClaims, isThinInput, ...podcastEpisodeScriptVariables } = podcastEpisodeScriptCase

	// the grader reads what the writer was given, and what the case says the Findings leave out
	const podcastEpisodeScriptVariablesJson = JSON.stringify(podcastEpisodeScriptVariables, null, 2)
	const sourceMaterial = `Source material, as the script's writer was given it:\n${podcastEpisodeScriptVariablesJson}`
	const unsupportedClaimsRubric = unsupportedClaims
		? `The source material does not say ${unsupportedClaims}. Fail the output if a host states any of that as a fact.`
		: ""

	// the support, quote, and title rubrics, each with the source material after it
	const rubricAssertions: Assertion[] = [
		{ metric: "says only what the findings support", rubric: `${SUPPORT_RUBRIC} ${unsupportedClaimsRubric}` },
		{ metric: "paraphrases, and names the source of a quote", rubric: QUOTE_RUBRIC },
		{ metric: "the title and the description are specific", rubric: TITLE_RUBRIC },
	].map(({ metric, rubric }) => ({
		type: "llm-rubric",
		metric,
		value: `${OUTPUT_SHAPE_RUBRIC} ${rubric.trim()}\n\n${sourceMaterial}`,
	}))

	// a thin input also has to yield a short script
	const thinInputAssertions: Assertion[] = isThinInput
		? [{ type: "javascript", metric: "a thin input yields a short script", value: gradeShortScript }]
		: []
	return { description, vars: podcastEpisodeScriptVariables, assert: [...rubricAssertions, ...thinInputAssertions] }
}

// fail the check if a chapter cites a Finding id that is not in the case's input
function gradeCitedFindings(writerOutput: string, context: AssertionValueFunctionContext): GradingResult {
	const inputFindingIds = toInputFindingIds(context)
	const unknownChapter = toChapters(writerOutput).find((chapter) => !inputFindingIds.includes(chapter.findingId))
	return toGradingResult(unknownChapter && `a chapter cites ${unknownChapter.findingId}, which is not in the input`)
}

// fail the check if the writer's own checks reject the outline or a segment as a first draft
function gradeWriterChecks(writerOutput: string, context: AssertionValueFunctionContext): GradingResult {
	const { outline } = toWrittenPodcastEpisode(writerOutput)
	const segments = context.providerResponse?.metadata?.segments as PodcastEpisodeSegment[]

	// run the checks. a RejectedScriptError is a failed check
	try {
		toCheckedPodcastEpisodeOutline({ outline, findingIds: toInputFindingIds(context) })
		for (const [segmentIndex, segment] of segments.entries()) {
			toCheckedPodcastEpisodeSegment({ segment, outline, segmentIndex })
		}
	} catch (error) {
		// any other error is a broken eval
		if (!(error instanceof RejectedScriptError)) {
			throw error
		}
		return toGradingResult(error.message)
	}
	return toGradingResult()
}

// fail the check if the title or the description runs past its limit
function gradeTitleAndDescriptionLength(writerOutput: string): GradingResult {
	const { title, description } = toWrittenPodcastEpisode(writerOutput).outline
	if (title.length > PODCAST_EPISODE_TITLE_MAX_CHARS) {
		return toGradingResult(
			`the title has ${title.length} characters, over the ${PODCAST_EPISODE_TITLE_MAX_CHARS} allowed`,
		)
	}
	if (description.length > PODCAST_EPISODE_DESCRIPTION_MAX_CHARS) {
		return toGradingResult(
			`the description has ${description.length} characters, over the ${PODCAST_EPISODE_DESCRIPTION_MAX_CHARS} allowed`,
		)
	}
	return toGradingResult()
}

// fail the check if the script runs past MAX_PODCAST_EPISODE_MINUTES, estimated from its word count
function gradeRunningTime(writerOutput: string): GradingResult {
	const scriptMinutes = toScriptMinutes(toWrittenPodcastEpisode(writerOutput).podcastEpisodeScript)
	return toGradingResult(
		scriptMinutes > MAX_PODCAST_EPISODE_MINUTES ? `the script runs ${scriptMinutes.toFixed(1)} minutes` : undefined,
	)
}

// fail the check unless a thin input's script has one chapter for each Finding and runs under the thin-input limit
function gradeShortScript(writerOutput: string, context: AssertionValueFunctionContext): GradingResult {
	const chapterCount = toChapters(writerOutput).length
	const findingCount = toInputFindingIds(context).length
	if (chapterCount !== findingCount) {
		return toGradingResult(`the script has ${chapterCount} chapters for ${findingCount} findings`)
	}

	// a thin input's script has to run under the thin-input limit
	const scriptMinutes = toScriptMinutes(toWrittenPodcastEpisode(writerOutput).podcastEpisodeScript)
	return toGradingResult(
		scriptMinutes >= MAX_THIN_PODCAST_EPISODE_MINUTES
			? `the script runs ${scriptMinutes.toFixed(1)} minutes`
			: undefined,
	)
}

// print each case with its chapter count, length, and writing cost, then one line for each check
function printReport(evaluateResults: EvaluateResult[]): void {
	for (const evaluateResult of evaluateResults.toSorted((first, second) => first.testIdx - second.testIdx)) {
		console.log(`\n${evaluateResult.success ? "PASS" : "FAIL"}  ${evaluateResult.testCase.description}`)

		// a case whose writer broke has no output and no checks, only the error
		const writerOutput = evaluateResult.response?.output
		if (typeof writerOutput !== "string") {
			console.log(`      broke: ${evaluateResult.error}`)
			continue
		}

		// print the case's chapter count, length, and writing cost
		const scriptMinutes = toScriptMinutes(toWrittenPodcastEpisode(writerOutput).podcastEpisodeScript)
		const writeCostDollars = (evaluateResult.cost ?? 0).toFixed(4)
		console.log(
			`      ${toChapters(writerOutput).length} chapters, ${scriptMinutes.toFixed(1)} minutes, $${writeCostDollars} to write`,
		)

		// print one line for each check, with a failed check's reason
		for (const checkResult of evaluateResult.gradingResult?.componentResults ?? []) {
			const failureReasonSuffix = checkResult.pass ? "" : `: ${checkResult.reason}`
			console.log(`      ${checkResult.pass ? "pass" : "FAIL"}  ${checkResult.assertion?.metric}${failureReasonSuffix}`)
		}
	}
}

// a check's result as promptfoo reads it. a check with no failure reason passes
function toGradingResult(failureReason?: string): GradingResult {
	return { pass: !failureReason, score: failureReason ? 0 : 1, reason: failureReason ?? "passed" }
}

// the writer's JSON output read back into its outline and script
function toWrittenPodcastEpisode(writerOutput: string): WrittenPodcastEpisode {
	return JSON.parse(writerOutput) as WrittenPodcastEpisode
}

// every chapter of the script in the writer's output, in order
function toChapters(writerOutput: string): PodcastEpisodeChapterScript[] {
	return toWrittenPodcastEpisode(writerOutput).podcastEpisodeScript.segments.flatMap((segment) => segment.chapters)
}

// the ids of the Findings that a case gave the writer
function toInputFindingIds(context: AssertionValueFunctionContext): string[] {
	const { podcastEpisodeFindings } = context.vars as PodcastEpisodeScriptVariables
	return podcastEpisodeFindings.map((podcastEpisodeFinding) => podcastEpisodeFinding.findingId)
}
