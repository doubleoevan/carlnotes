// the grader calibration cases of the updates recap eval's rubrics. the list and the recaps are made up
import type { UpdatesRecapVariables } from "../updates-recap/updatesRecapProviders"
import * as updatesRecapRubrics from "../updates-recap/updatesRecapRubrics"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the updates recap eval, with the list that its grader reads
const UPDATES_RECAP_EVAL: CalibratedEval = {
	evalName: "updates-recap",
	evalRubrics: updatesRecapRubrics,
	material: {
		topicNames: ["Home espresso", "Rooftop beekeeping"],
		findingTitles: ["Why light roasts need a finer grind than you think", "Varroa counts after a warm autumn"],
	} satisfies UpdatesRecapVariables,
}

// a recap that keeps every rubric
const PASSING_RECAP = "I went through the espresso and beekeeping reads and kept the ones I'd hand you myself."

// every updates recap rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const UPDATES_RECAP_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: UPDATES_RECAP_EVAL,
		rubricName: "the true-all-day rubric",
		rubric: updatesRecapRubrics.TRUE_ALL_DAY_RUBRIC,
		passingOutput: { description: "a recap about the subjects alone", fixedOutput: PASSING_RECAP },
		failingOutput: {
			description: "a recap that names one article and gives a count",
			fixedOutput: "I kept seven reads for you, starting with the piece on why light roasts need a finer grind.",
		},
	},
	{
		calibratedEval: UPDATES_RECAP_EVAL,
		rubricName: "the no-guilt rubric",
		rubric: updatesRecapRubrics.NO_GUILT_RUBRIC,
		passingOutput: { description: "a recap that asks for nothing", fixedOutput: PASSING_RECAP },
		failingOutput: {
			description: "a recap that says the reader missed things and should keep up",
			fixedOutput: "You missed a lot while you were away. Come back more often and I'll keep you sharp.",
		},
	},
	{
		calibratedEval: UPDATES_RECAP_EVAL,
		rubricName: "the voice rubric",
		rubric: updatesRecapRubrics.VOICE_RUBRIC,
		passingOutput: { description: "a recap in Carl's first person", fixedOutput: PASSING_RECAP },
		failingOutput: {
			description: "a recap that reads like a notification",
			fixedOutput: "Your personalized content digest is now available for review.",
		},
	},
]
