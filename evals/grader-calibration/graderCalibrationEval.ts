// the promptfoo eval of the rubric graders. a case passes if its grader returns the known verdict for a fixed output.
// the graders make real model calls. run the eval with: bun run eval:grader-calibration
import type { ApiProvider, Assertion, EvaluateResult, TestCase } from "promptfoo"
import { runEval, toRubricAssertions, toRubricGrader } from "../evalHarness"
import { GRADER_CALIBRATION_CASES, type GraderCalibrationCase } from "./graderCalibrationCases"
import { fixedOutputProvider, type GraderCalibrationVariables } from "./graderCalibrationProviders"

// the saved result's grader, named for every grader that the cases use. each case sets its own grader,
// so this provider grades nothing, and a case that reached this provider would fail
const GRADER_MODEL_IDS = new Set(
	GRADER_CALIBRATION_CASES.map((graderCalibrationCase) => toCaseGrader(graderCalibrationCase).id()),
)
const listedGradersProvider: ApiProvider = {
	id: () => [...GRADER_MODEL_IDS].join(", "),
	callApi: async () => ({ error: "every grader calibration case sets its own grader" }),
}

// run every case. each case is graded by the grader of the eval that the case calibrates
await runEval({
	name: "grader-calibration",
	description: "rubric grader calibration",
	provider: fixedOutputProvider,
	writerModels: [],
	grader: listedGradersProvider,
	gatePassRate: 1,
	defaultAssertions: [],
	testCases: GRADER_CALIBRATION_CASES.map(toTestCase),
	toCaseLine,
})

// one promptfoo test for a case. the case's fixed output, the grader of the eval that the case calibrates,
// and the rubric's check, which asserts the verdict that the case expects
function toTestCase(graderCalibrationCase: GraderCalibrationCase): TestCase {
	// read the case and the eval that the case calibrates
	const { description, calibratedEval, rubricName, rubric, fixedOutput, isPassExpected } = graderCalibrationCase
	const { evalName, evalRubrics, material } = calibratedEval

	// build the rubric's check the way the calibrated eval does, with the output's shape first and the material last
	const rubricAssertions = toRubricAssertions({
		outputShapeRubric: evalRubrics.OUTPUT_SHAPE_RUBRIC,
		caseRubrics: [{ metric: `${rubricName} ${isPassExpected ? "passes" : "fails"} the output`, rubric }],
		materialLabel: evalRubrics.MATERIAL_LABEL,
		material,
	})

	// an output that breaks the rubric has to fail the rubric, so the output's check is the rubric's negation
	const verdictAssertions = rubricAssertions.map(
		(rubricAssertion): Assertion => (isPassExpected ? rubricAssertion : { ...rubricAssertion, type: "not-llm-rubric" }),
	)

	// grade the case with the grader of the eval that the case calibrates
	const graderCalibrationVariables: GraderCalibrationVariables = { evalName, fixedOutput, isPassExpected }
	return {
		description,
		vars: graderCalibrationVariables,
		options: { provider: toCaseGrader(graderCalibrationCase) },
		assert: verdictAssertions,
	}
}

// the grader of the eval that a case calibrates
function toCaseGrader(graderCalibrationCase: GraderCalibrationCase): ApiProvider {
	return toRubricGrader(graderCalibrationCase.calibratedEval.evalRubrics.GRADER_MODEL)
}

// a case's eval and the verdict that the case expects
function toCaseLine(_fixedOutput: string, evaluateResult: EvaluateResult): string {
	const { evalName, isPassExpected } = evaluateResult.testCase.vars as GraderCalibrationVariables
	return `${evalName}, expects a ${isPassExpected ? "pass" : "fail"}`
}
