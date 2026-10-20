// the grader calibration cases of the podcast chat eval's rubrics. the chapter is the eval's own, and the
// answers are made up
import { BURR_SET_CHAPTER, VAGUE_CHAPTER_QUESTION } from "../podcast-chat/podcastChatCases"
import type { PodcastChatVariables } from "../podcast-chat/podcastChatProviders"
import * as podcastChatRubrics from "../podcast-chat/podcastChatRubrics"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the podcast chat eval, with the question and the chapter that its grader reads
const PODCAST_CHAT_EVAL: CalibratedEval = {
	evalName: "podcast-chat",
	evalRubrics: podcastChatRubrics,
	material: {
		question: VAGUE_CHAPTER_QUESTION,
		podcastEpisodeChapter: BURR_SET_CHAPTER,
	} satisfies PodcastChatVariables,
}

// the podcast chat rubrics, each with an answer that keeps the rubric and an answer that breaks the rubric
export const PODCAST_CHAT_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: PODCAST_CHAT_EVAL,
		rubricName: "the chapter answer rubric",
		rubric: podcastChatRubrics.CHAPTER_ANSWER_RUBRIC,
		passingOutput: {
			description: "an answer about the burr set the chapter was on",
			fixedOutput:
				"I meant the new Tamber burrs run about a third quieter, 62 decibels at a meter. Quiet enough to grind before anyone's up.",
		},
		failingOutput: {
			description: "an answer that asks what the listener meant instead of answering",
			fixedOutput: "Sorry, what did you mean? Which part are you asking about?",
		},
	},
	{
		calibratedEval: PODCAST_CHAT_EVAL,
		rubricName: "the takes-the-question rubric",
		rubric: podcastChatRubrics.TAKES_THE_QUESTION_RUBRIC,
		passingOutput: {
			description: "an answer that takes the question in a few words, then answers",
			fixedOutput:
				"Oh, hold that thought, Vienna. The new Tamber burrs run about a third quieter, 62 decibels at a meter.",
		},
		failingOutput: {
			description: "an answer that greets the listener by name and praises the question",
			fixedOutput:
				"Hi Maya, great question, thanks so much for calling in! The new Tamber burrs run about a third quieter.",
		},
	},
]
