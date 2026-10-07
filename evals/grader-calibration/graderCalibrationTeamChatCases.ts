// the grader calibration cases of the team chat eval's rubrics.
// the team is the team chat eval's, and its findings and the chat replies are made up
import type { RetrievedFinding } from "../../worker/chat/retrieve"
import { ROASTING_TOPIC_NAME, TEAM_CHAT_CONTEXT } from "../team-chat/teamChatCases"
import type { TeamChatVariables } from "../team-chat/teamChatProviders"
import * as teamChatRubrics from "../team-chat/teamChatRubrics"
import { QUIET_BURR_SET_FINDING, TOPIC_CHAT_CONTEXT } from "../topic-chat/topicChatCases"
import type { CalibratedEval, RubricCalibration } from "./graderCalibrationCases"

// the team's finding from its espresso topic, the topic chat eval's burr set finding labeled with its topic
const ESPRESSO_FINDING: RetrievedFinding = { ...QUIET_BURR_SET_FINDING, topicName: TOPIC_CHAT_CONTEXT.topicName }

// the team's finding from its roasting topic
const ROASTING_FINDING: RetrievedFinding = {
	title: "A countertop smoke filter for home roasters",
	url: "https://roastlog.example/smoke-filter",
	foundAt: new Date("2026-09-28"),
	relevanceScore: 0.88,
	relevanceExplanation: "A filter that cuts the smoke from roasting in a kitchen with no hood.",
	text: "Kettle & Drum's SF-2 filter clips onto small drum roasters, and in the company's own tests it cut visible smoke by about 70 percent. It costs $129.",
	topicName: ROASTING_TOPIC_NAME,
}

// the team chat eval, with the question and the team material that its grader reads.
// the team holds two topics, with one finding each
const TEAM_CHAT_EVAL: CalibratedEval = {
	evalName: "team-chat",
	evalRubrics: teamChatRubrics,
	material: {
		question: "What's new for the club's coffee corner, on the grinder side and on the roasting side?",
		teamChatContext: { ...TEAM_CHAT_CONTEXT, findings: [ESPRESSO_FINDING, ROASTING_FINDING], scanSummaries: [] },
	} satisfies TeamChatVariables,
}

// the lines of a team chat reply that keeps every team chat rubric. the reply names each finding's topic, credits each finding
// only with what the finding says, and marks the fact from outside the findings
const TEAM_CHAT_OPENING_LINE = "Two worth a look, one on each side."
const TEAM_CHAT_ESPRESSO_LINE = `- From ${TOPIC_CHAT_CONTEXT.topicName}: [A quieter burr set for home grinders](https://burrnotes.example/quiet-burrs). Tamber says its new burrs run about a third quieter than its old set, and they ship in March for $89.`
const ROASTING_FINDING_CITATION =
	"[A countertop smoke filter for home roasters](https://roastlog.example/smoke-filter). Kettle & Drum's SF-2 cut visible smoke by about 70 percent in the company's own tests, and it costs $129."
const TEAM_CHAT_ROASTING_LINE = `- From ${ROASTING_TOPIC_NAME}: ${ROASTING_FINDING_CITATION}`
const TEAM_CHAT_OUTSIDE_LINE =
	"The findings don't cover this, but a fan in the window next to the roaster clears what smoke is left."
const PASSING_TEAM_CHAT_REPLY = toTeamChatReply(TEAM_CHAT_ROASTING_LINE)

// every team chat rubric, each with an output that keeps the rubric and an output that breaks the rubric
export const TEAM_CHAT_RUBRIC_CALIBRATIONS: RubricCalibration[] = [
	{
		calibratedEval: TEAM_CHAT_EVAL,
		rubricName: "the support rubric",
		rubric: teamChatRubrics.SUPPORT_RUBRIC,
		passingOutput: {
			description: "a team chat reply that marks the fact from outside the findings",
			fixedOutput: PASSING_TEAM_CHAT_REPLY,
		},
		failingOutput: {
			description: "a team chat reply that credits a finding with a fact that it does not have",
			fixedOutput: toTeamChatReply(
				`${TEAM_CHAT_ROASTING_LINE} The finding also says its carbon cartridge lasts about 40 roasts.`,
			),
		},
	},
	{
		calibratedEval: TEAM_CHAT_EVAL,
		rubricName: "the finding topic rubric",
		rubric: teamChatRubrics.FINDING_TOPIC_RUBRIC,
		passingOutput: {
			description: "a team chat reply that names each finding's own topic",
			fixedOutput: PASSING_TEAM_CHAT_REPLY,
		},
		failingOutput: {
			description: "a team chat reply that credits the roasting finding to the espresso topic",
			fixedOutput: toTeamChatReply(`- From ${TOPIC_CHAT_CONTEXT.topicName}: ${ROASTING_FINDING_CITATION}`),
		},
	},
]

// a team chat reply with the roasting line that a case gives,
// and the same opening, espresso line, and outside line in every case
function toTeamChatReply(roastingLine: string): string {
	const findingsList = [TEAM_CHAT_ESPRESSO_LINE, roastingLine].join("\n")
	return [TEAM_CHAT_OPENING_LINE, findingsList, TEAM_CHAT_OUTSIDE_LINE].join("\n\n")
}
