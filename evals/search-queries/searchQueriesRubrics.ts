// the search queries eval's grader and rubrics, and the label of the topic after each rubric
import { chatModel } from "../../worker/models"

// the model that grades every rubric
export const GRADER_MODEL = chatModel()

// what every rubric tells the grader about the writer's output
export const OUTPUT_SHAPE_RUBRIC =
	"The output is a JSON object whose queries list holds the web search queries written for a reader's topic. Each query runs as its own search for fresh articles and YouTube playlists on the topic."

// the label of the topic after each rubric
export const MATERIAL_LABEL = "The topic, as the query writer was given it"

// the rubric that fails a query that is off the topic or searches for what the topic says to skip
export const ON_TOPIC_RUBRIC = [
	"Every query searches for this topic and respects what the topic says to skip.",
	"Fail the output if a query searches for something off the topic, or for something that the topic says to skip.",
	"Never fail the output for a query that asks for recent articles or for YouTube playlists.",
].join(" ")
