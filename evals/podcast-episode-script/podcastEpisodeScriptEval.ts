// the promptfoo eval of the podcast episode script writer, which makes real model calls.
// run the eval with: bun run eval:podcast-episode-script
import {
	PODCAST_EPISODE_DESCRIPTION_MAX_CHARS,
	PODCAST_EPISODE_TITLE_MAX_CHARS,
	type PodcastEpisodeChapterScript,
} from "@shared/contracts"
import type { Assertion, AssertionValueFunctionContext, EvaluateResult, GradingResult, TestCase } from "promptfoo"
import { scoreModel } from "../../worker/models"
import {
	isRepeatedGoodbyeOpeningTurn,
	MAX_PODCAST_EPISODE_MINUTES,
	type PodcastEpisodeSegment,
	RejectedScriptError,
	toCheckedPodcastEpisodeOutline,
	toCheckedPodcastEpisodeSegment,
	toScriptMinutes,
} from "../../worker/podcast/podcastEpisodeScript"
import { runEval, toGradingResult, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { PODCAST_EPISODE_SCRIPT_CASES, type PodcastEpisodeScriptCase } from "./podcastEpisodeScriptCases"
import {
	type PodcastEpisodeScriptVariables,
	podcastEpisodeScriptWriter,
	type WrittenPodcastEpisode,
} from "./podcastEpisodeScriptProviders"
import {
	GRADER_MODEL,
	MATERIAL_LABEL,
	OUTPUT_SHAPE_RUBRIC,
	QUOTE_RUBRIC,
	SUPPORT_RUBRIC,
	TITLE_RUBRIC,
} from "./podcastEpisodeScriptRubrics"

// a script from a thin input has to run under this many minutes
const MAX_THIN_PODCAST_EPISODE_MINUTES = 7

// the words that outline-podcast-episode.md tells the writer to open each description with
const DESCRIPTION_OPENING = "Carl and Vienna talk about"

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
	{ type: "javascript", metric: `the description opens with "${DESCRIPTION_OPENING}"`, value: gradeDescriptionOpening },
	{ type: "javascript", metric: "the writer leaves the goodbye's opening turns out", value: gradeGoodbyeOpening },
	{
		type: "javascript",
		metric: "the segments follow the outline prompt",
		value: gradeSegments,
	},
]

// run every case. the grader is on a different model from the model that writes the script
await runEval({
	name: "podcast-episode-script",
	description: "podcast episode script writer",
	provider: podcastEpisodeScriptWriter,
	writerModels: [scoreModel()],
	grader: toRubricGrader(GRADER_MODEL),
	gatePassRate: 0.9,
	defaultAssertions: DETERMINISTIC_ASSERTIONS,
	testCases: PODCAST_EPISODE_SCRIPT_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. its variables, the rubrics over its source material plus the case's own rubric,
// and the short-script check if its input is thin
function toTestCase(podcastEpisodeScriptCase: PodcastEpisodeScriptCase): TestCase {
	const {
		description,
		unsupportedClaims,
		isThinInput,
		rubric: caseRubric,
		...podcastEpisodeScriptVariables
	} = podcastEpisodeScriptCase

	// what the case says the Findings leave out
	const unsupportedClaimsRubric = unsupportedClaims
		? `The source material does not say ${unsupportedClaims}. Fail the output if a host states any of that as a fact.`
		: ""

	// the support, quote, and title rubrics, plus the case's own rubric, each with the source material after it
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [
			{ metric: "says only what the findings support", rubric: `${SUPPORT_RUBRIC} ${unsupportedClaimsRubric}` },
			{ metric: "paraphrases, and names the source of a quote", rubric: QUOTE_RUBRIC },
			{ metric: "the title and the description are specific", rubric: TITLE_RUBRIC },
			...(caseRubric ? [{ metric: description, rubric: caseRubric }] : []),
		],
		materialLabel: MATERIAL_LABEL,
		material: podcastEpisodeScriptVariables,
	})

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

// fail the check unless the description opens with DESCRIPTION_OPENING
function gradeDescriptionOpening(writerOutput: string): GradingResult {
	const { description } = toWrittenPodcastEpisode(writerOutput).outline
	return toGradingResult(
		description.startsWith(DESCRIPTION_OPENING) ? undefined : `the description opens "${description.slice(0, 40)}"`,
	)
}

// fail the check if the writer's sign-off or goodbye repeats a turn of GOODBYE_OPENING_TURNS, which
// toPodcastEpisodeScript adds
function gradeGoodbyeOpening(_writerOutput: string, context: AssertionValueFunctionContext): GradingResult {
	const segments = context.providerResponse?.metadata?.segments as PodcastEpisodeSegment[]
	const writerClosingTurns = segments.flatMap((segment) => [...(segment.signOff ?? []), ...(segment.goodbye ?? [])])

	// find a turn that repeats a goodbye opening turn, in any case and punctuation
	const repeatedTurn = writerClosingTurns.find(isRepeatedGoodbyeOpeningTurn)
	return toGradingResult(repeatedTurn && `the writer wrote "${repeatedTurn.text}"`)
}

// fail the check unless the segment count follows the outline prompt and every later segment has a transition
function gradeSegments(writerOutput: string, context: AssertionValueFunctionContext): GradingResult {
	// the outline prompt puts three findings or fewer in one segment, and four or more in two to four segments
	const { outline, podcastEpisodeScript } = toWrittenPodcastEpisode(writerOutput)
	const findingCount = toInputFindingIds(context).length
	const segmentCount = outline.segments.length
	const isSegmentCountExpected = findingCount <= 3 ? segmentCount === 1 : segmentCount >= 2 && segmentCount <= 4
	if (!isSegmentCountExpected) {
		return toGradingResult(`${findingCount} findings make ${segmentCount} segments`)
	}

	// every segment after the first segment opens with a transition from the segment before
	const missingTransitionIndex = podcastEpisodeScript.segments
		.slice(1)
		.findIndex((segment) => segment.transition.length === 0)
	return toGradingResult(
		missingTransitionIndex >= 0 ? `segment ${missingTransitionIndex + 2} has no transition` : undefined,
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

// a case's chapter count, length, and writing cost
function toCaseLine(writerOutput: string, evaluateResult: EvaluateResult): string {
	const scriptMinutes = toScriptMinutes(toWrittenPodcastEpisode(writerOutput).podcastEpisodeScript)
	const writeCostDollars = (evaluateResult.cost ?? 0).toFixed(4)
	return `${toChapters(writerOutput).length} chapters, ${scriptMinutes.toFixed(1)} minutes, $${writeCostDollars} to write`
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
