// the updates opener eval's grader and rubrics, and the label of the list after each rubric
import { chatModel } from "@carlnotes/models/models"

// the model that grades every rubric
export const GRADER_MODEL = chatModel()

// what every rubric tells the grader about the writer's output
export const OUTPUT_SHAPE_RUBRIC =
	"The output is Carl's short opener above a reader's list of unread articles, videos, and podcasts. The same opener shows above every list the reader opens that day."

// the label of the list after each rubric
export const MATERIAL_LABEL = "The Topic names and titles, as the opener's writer was given them"

// the rubric that fails an opener that stops being true for a later list that day
export const TRUE_ALL_DAY_RUBRIC = [
	"The opener stays true for any list the reader opens that day.",
	"Fail the output if it names one article, video, podcast, or author, repeats a title, or says what comes first, last, or at the top.",
	"Fail the output if it gives a number or a count of anything, in digits or in words, including words like a few or several.",
	"Never fail the output for naming a general subject or a Topic.",
].join(" ")

// the rubric that fails an opener that reports what the reader missed, guilt-trips them, or sells to them
export const NO_GUILT_RUBRIC = [
	"The opener treats the reader as someone who asked what's new and owes nothing.",
	"Fail the output if it says or suggests that the reader missed something, fell behind, was away, or should feel bad.",
	"Fail the output if it asks the reader to come back, to read more, or to do anything, or if it mentions a CarlNotes plan, a price, or a paid upgrade.",
	"Fail the output if it is smug or salesy.",
	"Never fail the output for the word upgrade in a Topic's own subject, such as a software upgrade.",
].join(" ")

// the rubric that fails an opener that does not sound like Carl
export const VOICE_RUBRIC = [
	"The opener sounds like Carl, a friend who reads everything: first person, short plain sentences, casual and human.",
	"Fail the output if it reads like a dashboard, a notification, or a form letter, or if it calls Carl by name as if someone else wrote it.",
].join(" ")
