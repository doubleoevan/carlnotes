// the grader calibration eval's cases, each a shared rubric of one eval and a made-up output whose verdict is known.
// this file joins each calibrated eval's own cases file into the list that the eval runs
import type { LanguageModel } from "ai"
import { ATTACHMENT_SUMMARIES_RUBRIC_CALIBRATIONS } from "./graderCalibrationAttachmentSummariesCases"
import { NEW_TOPIC_CHAT_RUBRIC_CALIBRATIONS } from "./graderCalibrationNewTopicChatCases"
import { PODCAST_EPISODE_SCRIPT_RUBRIC_CALIBRATIONS } from "./graderCalibrationPodcastEpisodeScriptCases"
import { SCAN_REPORT_RUBRIC_CALIBRATIONS } from "./graderCalibrationScanReportCases"
import { SEARCH_QUERIES_RUBRIC_CALIBRATIONS } from "./graderCalibrationSearchQueriesCases"
import { SOURCE_SUGGESTIONS_RUBRIC_CALIBRATIONS } from "./graderCalibrationSourceSuggestionsCases"
import { TEAM_CHAT_RUBRIC_CALIBRATIONS } from "./graderCalibrationTeamChatCases"
import { TOPIC_CHAT_RUBRIC_CALIBRATIONS } from "./graderCalibrationTopicChatCases"
import { TOPIC_CHAT_TOOLS_RUBRIC_CALIBRATIONS } from "./graderCalibrationTopicChatToolsCases"

// what an eval's rubrics module gives its grader. the grader's model, the output's shape, and the material's label
type EvalRubrics = { GRADER_MODEL: LanguageModel; OUTPUT_SHAPE_RUBRIC: string; MATERIAL_LABEL: string }

// an eval whose rubric grader the calibration checks. its name, its rubrics module, and the material that its grader
// reads after each rubric
export type CalibratedEval = { evalName: string; evalRubrics: EvalRubrics; material: unknown }

// one case. what the case tests, the eval and the rubric that the case calibrates, its fixed output,
// and the verdict that the rubric asks for
export type GraderCalibrationCase = {
	description: string
	calibratedEval: CalibratedEval
	// the rubric's name in the report, such as "the support rubric"
	rubricName: string
	rubric: string
	fixedOutput: string
	// whether the grader has to pass the output. an output that keeps the rubric passes,
	// and an output that breaks the rubric fails
	isPassExpected: boolean
}

// a fixed output and what the output tests
type CalibrationOutput = { description: string; fixedOutput: string }

// one rubric's calibration. the eval and the rubric, a passing output that keeps the rubric, and a failing output
// that breaks the rubric
export type RubricCalibration = Pick<GraderCalibrationCase, "calibratedEval" | "rubricName" | "rubric"> & {
	passingOutput: CalibrationOutput
	failingOutput: CalibrationOutput
}

// every shared rubric of every eval, each with an output that keeps the rubric and an output that breaks the rubric
const RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	...PODCAST_EPISODE_SCRIPT_RUBRIC_CALIBRATIONS,
	...SCAN_REPORT_RUBRIC_CALIBRATIONS,
	...TOPIC_CHAT_RUBRIC_CALIBRATIONS,
	...TOPIC_CHAT_TOOLS_RUBRIC_CALIBRATIONS,
	...NEW_TOPIC_CHAT_RUBRIC_CALIBRATIONS,
	...SOURCE_SUGGESTIONS_RUBRIC_CALIBRATIONS,
	...SEARCH_QUERIES_RUBRIC_CALIBRATIONS,
	...ATTACHMENT_SUMMARIES_RUBRIC_CALIBRATIONS,
	...TEAM_CHAT_RUBRIC_CALIBRATIONS,
]

// every case that the eval runs. each rubric's passing output, then its failing output
export const GRADER_CALIBRATION_CASES: GraderCalibrationCase[] = RUBRIC_CALIBRATIONS.flatMap(toGraderCalibrationCases)

// the two cases of one rubric's calibration. the grader has to pass the passing output and fail the failing output
function toGraderCalibrationCases({
	passingOutput,
	failingOutput,
	...rubricCalibration
}: RubricCalibration): GraderCalibrationCase[] {
	return [
		{ ...rubricCalibration, ...passingOutput, isPassExpected: true },
		{ ...rubricCalibration, ...failingOutput, isPassExpected: false },
	]
}
