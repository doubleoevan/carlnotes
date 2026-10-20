// the podcast chat eval's grader and rubrics, and the label of the question and the chapter after each rubric
import { scoreModel } from "../../worker/models"

// the model that grades every rubric
export const GRADER_MODEL = scoreModel()

// what every rubric tells the grader about the answer
export const OUTPUT_SHAPE_RUBRIC =
	"The output is the words Carl or Vienna, the hosts of a podcast episode, said out loud to a listener's spoken question, asked while the episode was paused on one chapter."

// the label of the question and the chapter after each rubric
export const MATERIAL_LABEL = "The question and the chapter it was asked during, as the answer's writer was given them"

// the rubric that fails an answer that is not about the chapter a vague question pointed at
export const CHAPTER_ANSWER_RUBRIC = [
	"The listener's question is vague and points back at what the hosts just said in the chapter below.",
	"Fail the output if it is not about that chapter's finding, the burr set and how quiet it is, or if it asks the listener what they meant instead of answering.",
].join(" ")

// the rubric that fails an answer that does not take the question like a live show's call-in, or takes it at length,
// by name, or with praise
export const TAKES_THE_QUESTION_RUBRIC = [
	"The listener cut into the episode to ask, and the answering host should take the question the way a host takes a call on air before answering it.",
	"Fail the output if it does not open with a few words that take the question, such as a quick word to the listener, an aside to the other host, or a beat of surprise.",
	"Fail it if that opening runs longer than a short sentence, calls the listener by a name, greets them, or praises the question, as in great question.",
].join(" ")
