// the grader calibration cases of the search queries eval's rubrics. the topic is the topic chat eval's with a skip
// added, and the queries are made up
import type { SearchQueriesVariables } from "../search-queries/searchQueriesProviders"
import * as searchQueriesRubrics from "../search-queries/searchQueriesRubrics"
import { TOPIC_CHAT_CONTEXT } from "../topic-chat/topicChatCases"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the search queries eval, with the topic that its grader reads. the topic says to skip commercial machines
const SEARCH_QUERIES_EVAL: CalibratedEval = {
	evalName: "search-queries",
	evalRubrics: searchQueriesRubrics,
	material: {
		topicName: TOPIC_CHAT_CONTEXT.topicName,
		topicContext: `${TOPIC_CHAT_CONTEXT.topicPrompt} Skip commercial machines.`,
	} satisfies SearchQueriesVariables,
}

// the queries of an output that keeps the on-topic rubric.
// the rubric allows a query for recent articles and a query for a YouTube playlist
const PASSING_SEARCH_QUERIES = [
	"quiet burr grinder for home espresso",
	"new low noise espresso grinders 2026",
	"espresso puck prep technique at home",
	"home espresso dialing in YouTube playlist",
]

// every search queries rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const SEARCH_QUERIES_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: SEARCH_QUERIES_EVAL,
		rubricName: "the on-topic rubric",
		rubric: searchQueriesRubrics.ON_TOPIC_RUBRIC,
		passingOutput: {
			description: "a query list whose every query is on the topic and none is for commercial machines",
			fixedOutput: JSON.stringify({ queries: PASSING_SEARCH_QUERIES }),
		},
		failingOutput: {
			description: "a query list with a query for commercial machines, which the topic says to skip",
			fixedOutput: JSON.stringify({
				queries: [...PASSING_SEARCH_QUERIES, "best commercial espresso machines for cafes"],
			}),
		},
	},
]
