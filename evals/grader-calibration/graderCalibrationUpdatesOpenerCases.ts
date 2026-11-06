// the grader calibration cases of the updates opener eval's rubrics. the list and the openers are made up
import type { UpdatesOpenerVariables } from "../updates-opener/updatesOpenerProviders"
import * as updatesOpenerRubrics from "../updates-opener/updatesOpenerRubrics"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the updates opener eval, with the list that its grader reads
const UPDATES_OPENER_EVAL: CalibratedEval = {
	evalName: "updates-opener",
	evalRubrics: updatesOpenerRubrics,
	material: {
		topicNames: ["Home espresso", "Rooftop beekeeping"],
		findingTitles: ["Why light roasts need a finer grind than you think", "Varroa counts after a warm autumn"],
	} satisfies UpdatesOpenerVariables,
}

// an opener that keeps every rubric
const PASSING_OPENER = "I went through the espresso and beekeeping reads and kept the ones I'd hand you myself."

// every updates opener rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const UPDATES_OPENER_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: UPDATES_OPENER_EVAL,
		rubricName: "the true-all-day rubric",
		rubric: updatesOpenerRubrics.TRUE_ALL_DAY_RUBRIC,
		passingOutput: { description: "an opener about the subjects alone", fixedOutput: PASSING_OPENER },
		failingOutput: {
			description: "an opener that names one article and gives a count",
			fixedOutput: "I kept seven reads for you, starting with the piece on why light roasts need a finer grind.",
		},
	},
	{
		calibratedEval: UPDATES_OPENER_EVAL,
		rubricName: "the no-guilt rubric",
		rubric: updatesOpenerRubrics.NO_GUILT_RUBRIC,
		passingOutput: { description: "an opener that asks for nothing", fixedOutput: PASSING_OPENER },
		failingOutput: {
			description: "an opener that says the reader missed things and should keep up",
			fixedOutput: "You missed a lot while you were away. Come back more often and I'll keep you sharp.",
		},
	},
	{
		calibratedEval: UPDATES_OPENER_EVAL,
		rubricName: "the voice rubric",
		rubric: updatesOpenerRubrics.VOICE_RUBRIC,
		passingOutput: { description: "an opener in Carl's first person", fixedOutput: PASSING_OPENER },
		failingOutput: {
			description: "an opener that reads like a notification",
			fixedOutput: "Your personalized content digest is now available for review.",
		},
	},
]
