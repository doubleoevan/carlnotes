// the podcast episode script eval's grader and rubrics, and the label of the source material after each rubric
import { chatModel } from "../../worker/models"

// the model that grades every rubric
export const GRADER_MODEL = chatModel()

// what every rubric tells the grader about the writer's output
export const OUTPUT_SHAPE_RUBRIC =
	"The output is one podcast episode as JSON: an outline with the title and the description, and a script of two hosts' turns in chapters, each chapter citing one finding by its id."

// the label of the source material after each rubric
export const MATERIAL_LABEL = "Source material, as the script's writer was given it"

// the rubric that fails a script for stating a fact that the Findings and their stored content do not support
export const SUPPORT_RUBRIC = [
	"Every factual specific a host states is supported by the source material below.",
	"A factual specific is a name, a number, a date, a price, a quotation, or an event.",
	"Fail the output if a host states a factual specific that the source material does not have, or one that contradicts it.",
	"Never fail the output for a host's reaction, opinion, joke, or question, for everyday reasoning about what the source material says, for a number rounded or said the way a person says it, or for the show's own words.",
	"The show is Coffee Break, the carlnotes.com podcast, and its hosts are Carl and Vienna. The cold open may name the show, carlnotes.com, and the hosts, and a host may mention Carl's backstory: he never sleeps, drinks coffee, reads everything, finished the internet, and holds a raccoon and a machine learning textbook in his picture, or Vienna's: she is interested in everything, has more interests than hours in the day, a stack of half-read books, and a new obsession every week, and follows her topics on CarlNotes. The show closes on Carl saying he has more reading to do and Vienna saying he always does, then a short goodbye in the hosts' own words.",
].join(" ")

// the rubric that fails a chapter for copying its source or for a quote with no named source
export const QUOTE_RUBRIC = [
	"Each chapter retells its finding's stored content in the hosts' own words.",
	"Fail the output if most of a chapter's turns are sentences of the stored content copied word for word.",
	"Fail the output if a turn quotes the stored content inside double quotation marks and that turn does not say who said it or who published it.",
	"A chapter with no quotation passes.",
	"How many quotations a chapter has is checked elsewhere, so never fail the output for their number.",
	"A name, a number, or a short phrase repeated from the stored content is not a copied sentence.",
].join(" ")

// the rubric that fails a title or a description that is not specific to the podcast episode's chapters
export const TITLE_RUBRIC = [
	"The outline's title and description are specific to this episode's chapters.",
	"Someone who reads them knows what these chapters cover, and neither would fit an episode about other findings on the same topic.",
	"Fail the output if the title is the topic's name alone, is clickbait, or names nothing that a chapter covers, or if the description names nothing that a chapter covers.",
	"Fail the output if the title or the description is cut off in the middle of a sentence or a word.",
].join(" ")
