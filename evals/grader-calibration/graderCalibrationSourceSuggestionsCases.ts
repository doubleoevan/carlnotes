// the grader calibration cases of the source suggestions eval's rubrics.
// the topic is the topic chat eval's, and the suggested sources are made up
import type { SuggestedSource } from "../../worker/suggest"
import type { SourceSuggestionsVariables } from "../source-suggestions/sourceSuggestionsProviders"
import * as sourceSuggestionsRubrics from "../source-suggestions/sourceSuggestionsRubrics"
import { TOPIC_CHAT_CONTEXT } from "../topic-chat/topicChatCases"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the source suggestions eval, with the topic that its grader reads
const SOURCE_SUGGESTIONS_EVAL: CalibratedEval = {
	evalName: "source-suggestions",
	evalRubrics: sourceSuggestionsRubrics,
	material: {
		name: TOPIC_CHAT_CONTEXT.topicName,
		prompt: TOPIC_CHAT_CONTEXT.topicPrompt,
		excludeSources: [],
	} satisfies SourceSuggestionsVariables,
}

// the sources suggested for the topic, every source about espresso
const ESPRESSO_SUGGESTED_SOURCES: SuggestedSource[] = [
	{ sourceOption: "rss", value: "https://espressogear.example/feed.xml" },
	{ sourceOption: "reddit", value: "espresso" },
	{ sourceOption: "googleNews", value: "homeespresso.example" },
]

// every source suggestions rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const SOURCE_SUGGESTIONS_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: SOURCE_SUGGESTIONS_EVAL,
		rubricName: "the fit rubric",
		rubric: sourceSuggestionsRubrics.FIT_RUBRIC,
		passingOutput: {
			description: "a source list whose every source is about espresso",
			fixedOutput: JSON.stringify({ suggestedSources: ESPRESSO_SUGGESTED_SOURCES }),
		},
		failingOutput: {
			description: "a source list with an off-topic gardening subreddit",
			fixedOutput: JSON.stringify({
				suggestedSources: [...ESPRESSO_SUGGESTED_SOURCES, { sourceOption: "reddit", value: "gardening" }],
			}),
		},
	},
]
