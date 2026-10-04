// the podcast episode script eval's promptfoo providers. the writer under test, and the model that grades a rubric.
// both call the LiteLLM proxy through worker/models.ts
import type { PodcastEpisodeScript } from "@shared/contracts"
import { generateText, type ModelMessage } from "ai"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import { chatModel } from "../../worker/models"
import {
	generatePodcastEpisodeOutline,
	generatePodcastEpisodeSegment,
} from "../../worker/podcast/generatePodcastEpisodeScript"
import {
	type PodcastEpisodeFinding,
	type PodcastEpisodeOutline,
	RejectedScriptError,
	toPodcastEpisodeScript,
} from "../../worker/podcast/podcastEpisodeScript"

// the variables that a case gives the writer. the Topic's name and prompt, and the Findings
export type PodcastEpisodeScriptVariables = {
	topicName: string
	topicPrompt: string
	podcastEpisodeFindings: PodcastEpisodeFinding[]
}

// the JSON output that the writer returns for a case. the outline and the whole script
export type WrittenPodcastEpisode = { outline: PodcastEpisodeOutline; podcastEpisodeScript: PodcastEpisodeScript }

// the writer under test. its output is a WrittenPodcastEpisode, and its metadata has each segment as its call wrote it
export const podcastEpisodeScriptWriter: ApiProvider = {
	id: () => "podcast-episode-script-writer",
	callApi: writeCasePodcastEpisode,
}

// the grader for every rubric, on a different model from the model that writes the script
export const rubricGrader: ApiProvider = { id: () => "chat-model", callApi: gradeRubric }

// write one case's podcast episode with one unchecked draft of the outline call and of each segment call.
// the writer builds its own prompts from the case's variables, so the prompt that promptfoo rendered is not read
async function writeCasePodcastEpisode(
	_renderedPrompt: string,
	context?: CallApiContextParams,
): Promise<ProviderResponse> {
	const podcastEpisodeScriptVariables = context?.vars as PodcastEpisodeScriptVariables

	// write the outline, then every segment against the outline
	const outlineCallResult = await generatePodcastEpisodeOutline(podcastEpisodeScriptVariables)
	const outline = outlineCallResult.scriptDraft
	const segmentCallResults = await Promise.all(
		outline.segments.map((_, segmentIndex) =>
			generatePodcastEpisodeSegment({ ...podcastEpisodeScriptVariables, outline, segmentIndex }),
		),
	)
	const segments = segmentCallResults.map((segmentCallResult) => segmentCallResult.scriptDraft)

	// add up what the calls cost, and build the script from the segments
	const costDollars = [outlineCallResult, ...segmentCallResults].reduce(
		(sum, scriptCallResult) => sum + scriptCallResult.costDollars,
		0,
	)
	try {
		const writtenPodcastEpisode: WrittenPodcastEpisode = {
			outline,
			podcastEpisodeScript: toPodcastEpisodeScript(segments),
		}
		return { output: JSON.stringify(writtenPodcastEpisode), metadata: { segments }, cost: costDollars }
	} catch (error) {
		// a script that cannot be built is the case's error, returned with the outline and the segments that were written
		if (!(error instanceof RejectedScriptError)) {
			throw error
		}
		return { error: error.message, metadata: { outline, segments }, cost: costDollars }
	}
}

// grade one rubric. promptfoo sends its grading prompt as a JSON list of chat messages, the first a system message
async function gradeRubric(gradingPrompt: string): Promise<ProviderResponse> {
	const { text, usage } = await generateText({
		model: chatModel(),
		messages: JSON.parse(gradingPrompt) as ModelMessage[],
		allowSystemInMessages: true,
	})
	const tokenUsage = { total: usage.totalTokens, prompt: usage.inputTokens, completion: usage.outputTokens }
	return { output: text, tokenUsage }
}
