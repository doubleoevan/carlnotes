// the source suggestions eval's grader and rubrics, and the label of the topic after each rubric
import { chatModel } from "../../worker/models"

// the model that grades every rubric
export const GRADER_MODEL = chatModel()

// what every rubric tells the grader about the suggester's output
export const OUTPUT_SHAPE_RUBRIC =
	"The output is a JSON object whose suggestedSources list holds the sources suggested for a topic to follow. Each one has its kind as sourceOption, and its value: a feed url, a publisher's domain, a subreddit name, or an account handle. A YouTube channel and a podcast have already been looked up, so their value is the id that was found, and a name, if one is given, is the channel's handle or the show's name. Never fail the output for a value that is an id."

// the label of the topic after each rubric
export const MATERIAL_LABEL = "The topic, as the suggester was given it"

// the rubric that fails a suggestion that is off topic or will not keep producing
export const FIT_RUBRIC = [
	"Every source publishes about this topic and keeps producing: a feed, a publication, a channel, a subreddit, a show, or an account.",
	"Fail the output if a source is off topic, or is a single article or a page that will not change.",
].join(" ")
