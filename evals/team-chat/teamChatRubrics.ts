// the team chat eval's grader and rubrics, and the label of the question and the team material after each rubric
import { scoreModel } from "../../worker/models"
import { toChatSupportRubric } from "../topic-chat/topicChatRubrics"

// the model that grades every rubric
export const GRADER_MODEL = scoreModel()

// what every rubric tells the grader about the reply
export const OUTPUT_SHAPE_RUBRIC = [
	"The output is Carl's chat reply to a team member's question in the team's chat, which reads across every topic the team holds.",
	"Carl answers from the topics' findings, each labeled with its topic in topicName, and from his own knowledge.",
].join(" ")

// the label of the question and the team material after each rubric
export const MATERIAL_LABEL = "The question and the team material, as the reply's writer was given them"

// the rubric that fails a reply for crediting the findings with what the findings do not say
export const SUPPORT_RUBRIC = toChatSupportRubric("team")

// the rubric that fails a reply for crediting a finding to the wrong topic, or for leaving a finding's topic unnamed
export const FINDING_TOPIC_RUBRIC = [
	"Every finding the reply cites belongs to the topic that its topicName names.",
	"Fail the output if it says a finding came from a different topic, or if the team holds more than one topic and the reply cites a finding without naming that finding's topic.",
	"Naming a topic once over a group of its findings names it for each of them. Pass the output if it cites no finding.",
].join(" ")
