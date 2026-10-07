// the grader calibration cases of the podcast episode script eval's rubrics.
// the topic is the topic chat eval's, and the finding and the podcast episodes are made up
import type { PodcastEpisodeTurn } from "@shared/contracts"
import { GOODBYE_OPENING_TURNS, type PodcastEpisodeFinding } from "../../worker/podcast/podcastEpisodeScript"
import type {
	PodcastEpisodeScriptVariables,
	WrittenPodcastEpisode,
} from "../podcast-episode-script/podcastEpisodeScriptProviders"
import * as podcastEpisodeScriptRubrics from "../podcast-episode-script/podcastEpisodeScriptRubrics"
import { TOPIC_CHAT_CONTEXT } from "../topic-chat/topicChatCases"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the finding that the podcast episode script calibration cases narrate, with a quote from a named person
const PODCAST_EPISODE_FINDING: PodcastEpisodeFinding = {
	findingId: "0d4b6f2e-8a31-4c57-b9e2-7f15a3c80c01",
	title: "A quieter burr set for home grinders",
	sourceHost: "burrnotes.example",
	snippet: "A grinder maker announced a burr set that runs at 62 decibels, about a third quieter than its last one.",
	relevanceExplanation:
		"The reader grinds before the house is awake, so a quieter grinder is the upgrade they asked about.",
	content: [
		"Tamber announced a 64 millimeter burr set this week that it says runs at 62 decibels at one meter, about a third quieter than the set it replaces.",
		"The burrs fit the company's existing Model S grinder with no other changes.",
		'"Quiet should not mean slow," said Lena Ortiz, who leads design at Tamber.',
		"The set ships in March.",
	].join(" "),
}

// the podcast episode script eval, with the topic and the finding that its grader reads
const PODCAST_EPISODE_SCRIPT_EVAL: CalibratedEval = {
	evalName: "podcast-episode-script",
	evalRubrics: podcastEpisodeScriptRubrics,
	material: {
		topicName: TOPIC_CHAT_CONTEXT.topicName,
		topicPrompt: TOPIC_CHAT_CONTEXT.topicPrompt,
		podcastEpisodeFindings: [PODCAST_EPISODE_FINDING],
	} satisfies PodcastEpisodeScriptVariables,
}

// the turns of a chapter that keeps every podcast episode script rubric.
// the hosts paraphrase the finding, and the quote names its speaker
const CHAPTER_NOISE_TURN: PodcastEpisodeTurn = {
	speaker: "host",
	text: "Tamber has a new 64 millimeter burr set, and it puts the noise at 62 decibels from a meter away.",
}
const CHAPTER_FIT_TURN: PodcastEpisodeTurn = {
	speaker: "cohost",
	text: "Which it says is about a third quieter than the old set. And it drops right into the Model S, no other changes.",
}
const CHAPTER_QUOTE_TURN: PodcastEpisodeTurn = {
	speaker: "host",
	text: 'Lena Ortiz, who leads design at Tamber, put it this way: "Quiet should not mean slow."',
}
const CHAPTER_SHIPPING_TURN: PodcastEpisodeTurn = {
	speaker: "cohost",
	text: "I like that. And it ships in March, so early risers won't wait long.",
}

// a podcast episode that keeps every podcast episode script rubric, with a title that names what its chapter covers
const PASSING_CHAPTER_TURNS = [CHAPTER_NOISE_TURN, CHAPTER_FIT_TURN, CHAPTER_QUOTE_TURN, CHAPTER_SHIPPING_TURN]
const PODCAST_EPISODE_TITLE = "A grinder a third quieter for early mornings"
const PASSING_PODCAST_EPISODE_OUTPUT = toPodcastEpisodeOutput(PODCAST_EPISODE_TITLE, PASSING_CHAPTER_TURNS)

// every podcast episode script rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const PODCAST_EPISODE_SCRIPT_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: PODCAST_EPISODE_SCRIPT_EVAL,
		rubricName: "the support rubric",
		rubric: podcastEpisodeScriptRubrics.SUPPORT_RUBRIC,
		passingOutput: {
			description: "a podcast episode whose hosts state only the finding's facts",
			fixedOutput: PASSING_PODCAST_EPISODE_OUTPUT,
		},
		failingOutput: {
			description: "a podcast episode whose host states a price that the finding does not have",
			fixedOutput: toPodcastEpisodeOutput(PODCAST_EPISODE_TITLE, [
				CHAPTER_NOISE_TURN,
				CHAPTER_FIT_TURN,
				CHAPTER_QUOTE_TURN,
				{
					speaker: "cohost",
					text: "I like that. And it ships in March for 89 dollars, so early risers won't wait long.",
				},
			]),
		},
	},
	{
		calibratedEval: PODCAST_EPISODE_SCRIPT_EVAL,
		rubricName: "the quote rubric",
		rubric: podcastEpisodeScriptRubrics.QUOTE_RUBRIC,
		passingOutput: {
			description: "a podcast episode that paraphrases its finding and names who it quotes",
			fixedOutput: PASSING_PODCAST_EPISODE_OUTPUT,
		},
		failingOutput: {
			description: "a podcast episode that quotes its finding without naming who said it",
			fixedOutput: toPodcastEpisodeOutput(PODCAST_EPISODE_TITLE, [
				CHAPTER_NOISE_TURN,
				CHAPTER_FIT_TURN,
				{ speaker: "host", text: 'And the line I keep thinking about is "Quiet should not mean slow."' },
				CHAPTER_SHIPPING_TURN,
			]),
		},
	},
	{
		calibratedEval: PODCAST_EPISODE_SCRIPT_EVAL,
		rubricName: "the title rubric",
		rubric: podcastEpisodeScriptRubrics.TITLE_RUBRIC,
		passingOutput: {
			description: "a podcast episode whose title names what its chapter covers",
			fixedOutput: PASSING_PODCAST_EPISODE_OUTPUT,
		},
		failingOutput: {
			description: "a podcast episode titled with the topic's name alone",
			fixedOutput: toPodcastEpisodeOutput(TOPIC_CHAT_CONTEXT.topicName, PASSING_CHAPTER_TURNS),
		},
	},
]

// a podcast episode as the writer's JSON output. the title and the chapter turns that a case gives, with the same
// description, cold open, transition, and sign-off in every case
function toPodcastEpisodeOutput(title: string, chapterTurns: PodcastEpisodeTurn[]): string {
	const { findingId } = PODCAST_EPISODE_FINDING
	const writtenPodcastEpisode: WrittenPodcastEpisode = {
		outline: {
			title,
			description:
				"Carl and Vienna talk about Tamber's new burr set, which runs at 62 decibels and fits the Model S grinder.",
			segments: [{ theme: "Quiet grinding", chapters: [{ findingId, minutes: 3 }] }],
		},
		podcastEpisodeScript: {
			coldOpen: [
				{ speaker: "host", text: "This is Coffee Break, the carlnotes.com podcast. I'm Carl." },
				{ speaker: "cohost", text: "And I'm Vienna. Today, a grinder you might run before the house wakes up." },
			],
			segments: [
				{
					transition: [{ speaker: "host", text: "Let's start with the noise." }],
					chapters: [{ findingId, title: "A quieter burr set", turns: chapterTurns }],
				},
			],
			signOff: [
				{ speaker: "host", text: "That's the show." },
				...GOODBYE_OPENING_TURNS,
				{ speaker: "cohost", text: "See you next time." },
			],
		},
	}
	return JSON.stringify(writtenPodcastEpisode)
}
