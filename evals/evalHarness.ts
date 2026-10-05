// the code that the promptfoo evals share. runEval and its report, the rubric grader, and the helpers that providers
// and checks use. each eval keeps its own cases, rubrics, and checks
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { generateText, type LanguageModel, type ModelMessage, type Tool } from "ai"
import {
	type ApiProvider,
	type Assertion,
	type EvaluateResult,
	evaluate,
	type GradingResult,
	type ProviderResponse,
	type TestCase,
} from "promptfoo"

// how many times each case runs, from --repeat. a model's output varies, so several runs show how often a check passes
const { values: evalFlags } = parseArgs({
	args: Bun.argv.slice(2),
	options: { repeat: { type: "string", default: "1" } },
})
const REPEAT_COUNT = Number(evalFlags.repeat)

// reject a repeat count that is not a whole number of 1 or more, before any run rewrites the badge
if (!Number.isInteger(REPEAT_COUNT) || REPEAT_COUNT < 1) {
	throw new Error(`--repeat must be a whole number of 1 or more, not ${evalFlags.repeat}`)
}

// the folder that holds each eval's latest pass count and the badge file that the README shows. the folder is committed
const RESULTS_DIRECTORY = join(import.meta.dir, "results")
const BADGE_FILE_NAME = "badge.json"

// one eval's saved pass count. a run is one case run once
type SavedEvalResult = { name: string; passedRunCount: number; runCount: number; ranOn: string }

// one tool call that a chat turn made, with its input
export type RecordedToolCall = { toolName: string; input: unknown }

// one model-graded check. the metric that names it in the report, and the rubric that the grader applies
export type CaseRubric = { metric: string; rubric: string }

// a case's rubrics, the output's shape that every rubric starts with, and the material that the writer was given
type ToRubricAssertionsOptions = {
	outputShapeRubric: string
	caseRubrics: CaseRubric[]
	materialLabel: string
	material: unknown
}

// the options for runEval. the eval's name, the code under test, the grader, the checks that every case gets, and
// the cases
export type RunEvalOptions = {
	// the eval's folder name, which names its full results in logs/ and its pass count in evals/results/
	name: string
	description: string
	provider: ApiProvider
	grader: ApiProvider
	defaultAssertions: Assertion[]
	testCases: TestCase[]
	// the line printed under each run's description, such as the output's length and the run's cost
	toCaseLine: (output: string, evaluateResult: EvaluateResult) => string
	// a line printed once after the report, for a number measured across every run
	toSummaryLine?: (evaluateResults: EvaluateResult[]) => string
}

/**
 * Runs every case four at a time, saves and prints the results, and sets a failing exit code if a run failed or broke.
 */
export async function runEval(runEvalOptions: RunEvalOptions): Promise<void> {
	// turn the prompt registry off. the eval measures the bundled templates in git.
	// turn promptfoo's own usage telemetry off too
	delete Bun.env.LANGFUSE_PUBLIC_KEY
	Bun.env.PROMPTFOO_DISABLE_TELEMETRY = "true"

	// run every case with nothing saved to promptfoo's own database
	const evalRecord = await evaluate(
		{
			description: runEvalOptions.description,
			// the provider builds its own prompts from a case's variables, so this prompt only labels the eval
			prompts: [runEvalOptions.description],
			providers: [runEvalOptions.provider],
			// the grader and the default checks for every case. a list in a case's variables stays one value
			defaultTest: {
				options: { provider: runEvalOptions.grader, disableVarExpansion: true },
				assert: runEvalOptions.defaultAssertions,
			},
			tests: runEvalOptions.testCases,
			writeLatestResults: false,
		},
		{ cache: false, maxConcurrency: 4, repeat: REPEAT_COUNT },
	)

	// save the full results for reading an output after a check fails. logs/ is gitignored
	const evaluateSummary = await evalRecord.toEvaluateSummary()
	const resultsPath = `logs/eval-${runEvalOptions.name}.json`
	await Bun.write(resultsPath, JSON.stringify(evaluateSummary, null, 2))

	// save the pass count for the README badge
	const { successes: successCount, failures: failureCount, errors: errorCount, tokenUsage } = evaluateSummary.stats
	const ranOn = new Date().toISOString().slice(0, 10)
	await saveEvalResult({
		name: runEvalOptions.name,
		passedRunCount: successCount,
		runCount: evaluateSummary.results.length,
		ranOn,
	})

	// print the report and set a failing exit code if any run failed or broke
	printReport(evaluateSummary.results, runEvalOptions.toCaseLine)
	if (REPEAT_COUNT > 1) {
		printPassRates(evaluateSummary.results)
	}
	if (runEvalOptions.toSummaryLine) {
		console.log(`\n${runEvalOptions.toSummaryLine(evaluateSummary.results)}`)
	}
	console.log(
		`\n${successCount} passed, ${failureCount} failed, ${errorCount} broke.`,
		`grading used ${tokenUsage.assertions?.total} tokens`,
	)
	console.log(`full results: ${resultsPath}`)
	process.exitCode = failureCount + errorCount > 0 ? 1 : 0
}

/**
 * Returns a promptfoo provider that grades a rubric on the given model.
 */
export function toRubricGrader(model: LanguageModel): ApiProvider {
	const graderId = typeof model === "string" ? model : model.modelId
	return { id: () => graderId, callApi: (gradingPrompt) => gradeRubric(model, gradingPrompt) }
}

/**
 * Returns a check's promptfoo grading result, which passes if there is no failure reason.
 */
export function toGradingResult(failureReason?: string): GradingResult {
	return { pass: !failureReason, score: failureReason ? 0 : 1, reason: failureReason ?? "passed" }
}

/**
 * Returns one model-graded check for each rubric, with the output's shape before it and the writer's material after it.
 */
export function toRubricAssertions({
	outputShapeRubric,
	caseRubrics,
	materialLabel,
	material,
}: ToRubricAssertionsOptions): Assertion[] {
	// the material as the grader reads it, after each rubric
	const materialText = `${materialLabel}:\n${JSON.stringify(material, null, 2)}`
	return caseRubrics.map(({ metric, rubric }) => ({
		type: "llm-rubric",
		metric,
		value: `${outputShapeRubric} ${rubric.trim()}\n\n${materialText}`,
	}))
}

/**
 * Returns the text of every model step in order, with a blank line between steps.
 */
export function toStepsText(steps: { text: string }[]): string {
	return steps
		.map((step) => step.text.trim())
		.filter(Boolean)
		.join("\n\n")
}

/**
 * Returns the url of every Markdown link in the text, in order.
 */
export function toLinkUrls(markdownText: string): string[] {
	return [...markdownText.matchAll(/\]\(\s*<?([^\s<>)]+)>?[^)]*\)/g)].map((linkMatch) => linkMatch[1] ?? "")
}

/**
 * Wraps each tool to record the tool call's name and input before the tool runs.
 */
export function toRecordingTools(
	recordedToolCalls: RecordedToolCall[],
	tools: Record<string, Tool>,
): Record<string, Tool> {
	return Object.fromEntries(
		Object.entries(tools).map(([toolName, chatTool]) => [
			toolName,
			{
				...chatTool,
				execute: (input: unknown, options: Parameters<NonNullable<Tool["execute"]>>[1]) => {
					// record the call, then run the tool. the AI SDK calls execute only after the input passes the tool's schema
					recordedToolCalls.push({ toolName, input })
					return chatTool.execute?.(input, options)
				},
			},
		]),
	)
}

// save one eval's result, then rebuild the badge from every eval's saved result
async function saveEvalResult(savedEvalResult: SavedEvalResult): Promise<void> {
	await Bun.write(
		join(RESULTS_DIRECTORY, `${savedEvalResult.name}.json`),
		`${JSON.stringify(savedEvalResult, null, "\t")}\n`,
	)

	// add up the runs of every eval that has a saved result
	const resultFileNames = readdirSync(RESULTS_DIRECTORY).filter(
		(fileName) => fileName.endsWith(".json") && fileName !== BADGE_FILE_NAME,
	)
	const savedEvalResults = await Promise.all(
		resultFileNames.map((fileName) => Bun.file(join(RESULTS_DIRECTORY, fileName)).json() as Promise<SavedEvalResult>),
	)
	const passedRunCount = savedEvalResults.reduce((sum, savedResult) => sum + savedResult.passedRunCount, 0)
	const runCount = savedEvalResults.reduce((sum, savedResult) => sum + savedResult.runCount, 0)

	// write the badge in the shields.io endpoint format
	const passRate = runCount > 0 ? passedRunCount / runCount : 0
	const badgeColor = toBadgeColor(passRate)
	const badge = {
		schemaVersion: 1,
		label: "evals",
		message: `${passedRunCount}/${runCount} passing`,
		color: badgeColor,
	}
	await Bun.write(join(RESULTS_DIRECTORY, BADGE_FILE_NAME), `${JSON.stringify(badge, null, "\t")}\n`)
}

// pick the badge's color for a pass rate. green if every run passed, yellow from 80 percent, and red below 80 percent
function toBadgeColor(passRate: number): string {
	if (passRate === 1) {
		return "brightgreen"
	}
	return passRate >= 0.8 ? "yellow" : "red"
}

// grade one rubric. promptfoo sends its grading prompt as a JSON list of chat messages, the first a system message
async function gradeRubric(model: LanguageModel, gradingPrompt: string): Promise<ProviderResponse> {
	const { text, usage } = await generateText({
		model,
		messages: JSON.parse(gradingPrompt) as ModelMessage[],
		allowSystemInMessages: true,
	})
	const tokenUsage = { total: usage.totalTokens, prompt: usage.inputTokens, completion: usage.outputTokens }
	return { output: text, tokenUsage }
}

// print each run of each case with its case line, then one line for each check
function printReport(
	evaluateResults: EvaluateResult[],
	toCaseLine: (output: string, evaluateResult: EvaluateResult) => string,
): void {
	for (const evaluateResult of evaluateResults.toSorted((first, second) => first.testIdx - second.testIdx)) {
		console.log(`\n${evaluateResult.success ? "PASS" : "FAIL"}  ${evaluateResult.testCase.description}`)

		// print only the error for a run whose provider broke. that run has no output and no checks
		const output = evaluateResult.response?.output
		if (typeof output !== "string") {
			console.log(`      broke: ${evaluateResult.error}`)
			continue
		}
		console.log(`      ${toCaseLine(output, evaluateResult)}`)

		// print one line for each check, with a failed check's reason
		for (const checkResult of evaluateResult.gradingResult?.componentResults ?? []) {
			const failureReasonSuffix = checkResult.pass ? "" : `: ${checkResult.reason}`
			console.log(`      ${checkResult.pass ? "pass" : "FAIL"}  ${checkResult.assertion?.metric}${failureReasonSuffix}`)
		}
	}
}

// print how many of each case's runs passed, in case order
function printPassRates(evaluateResults: EvaluateResult[]): void {
	console.log("\npass rates:")
	const orderedEvaluateResults = evaluateResults.toSorted((first, second) => first.testIdx - second.testIdx)
	const caseDescriptions = new Set(orderedEvaluateResults.map((evaluateResult) => evaluateResult.testCase.description))
	for (const caseDescription of caseDescriptions) {
		const caseEvaluateResults = evaluateResults.filter(
			(evaluateResult) => evaluateResult.testCase.description === caseDescription,
		)
		const passedRunCount = caseEvaluateResults.filter((evaluateResult) => evaluateResult.success).length
		console.log(`      ${passedRunCount} of ${caseEvaluateResults.length}  ${caseDescription}`)
	}
}
