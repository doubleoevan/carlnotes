// the dashboard paragraph eval's grader and rubrics, and the label of the numbers after each rubric
import { chatModel } from "@carlnotes/models/models"

// the model that grades every rubric
export const GRADER_MODEL = chatModel()

// what every rubric tells the grader about the writer's output
export const OUTPUT_SHAPE_RUBRIC =
	"The output is Carl's short paragraph above the charts of a Specials page, which shows who visited a person's or a team's topics, or who played their podcasts."

// the label of the numbers after each rubric
export const MATERIAL_LABEL = "The page's numbers and places, as the paragraph's writer was given them"

// the rubric that fails a paragraph that invents or misreads a number, or says the numbers are the reader's
export const FAITHFUL_RUBRIC = [
	"The paragraph uses only the numbers and places it was given.",
	"Fail the output if it gives a number, a place, a date, or a reason that the material does not hold, or misstates a number.",
	"Fail the output if it says the numbers belong to the reader, as in your topics or you have, since the reader may be anyone.",
	"Never fail the output for rounding a number in a way that keeps its meaning.",
].join(" ")

// the rubric that fails a paragraph that asks, sells, or names an item
export const NOTHING_ASKED_RUBRIC = [
	"The paragraph reads the numbers to the reader and asks nothing of them.",
	"Fail the output if it asks the reader to do anything, promises anything, or mentions a CarlNotes plan, a price, or an upgrade.",
	"Fail the output if it names a topic, a finding, a post, a podcast, an episode, or a person.",
].join(" ")

// the rubric that fails a paragraph that does not sound like Carl
export const VOICE_RUBRIC = [
	"The paragraph sounds like Carl, a friend who looked at the numbers first: first person, short plain sentences, warm and specific.",
	"Fail the output if it reads like a report, a dashboard, or a form letter, or if it calls Carl by name as if someone else wrote it.",
].join(" ")
