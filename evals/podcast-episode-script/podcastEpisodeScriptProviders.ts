// the podcast episode script eval's promptfoo provider, which runs the script writer under test
import type { PodcastEpisodeScript } from "@shared/contracts"
import { FULL_PODCAST_EPISODE_MINUTES } from "@shared/podcastEpisodes"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import {
	generatePodcastEpisodeOutline,
	generatePodcastEpisodeSegment,
} from "../../worker/podcast/generatePodcastEpisodeScript"
import type { PodcastEpisodeOutline } from "../../worker/podcast/podcastEpisodeOutline"
import {
	type PodcastEpisodeFinding,
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

// write one case's podcast episode with one unchecked draft of the outline call and of each segment call.
// the writer builds its own prompts from the case's variables, so the prompt that promptfoo rendered is not read
async function writeCasePodcastEpisode(
	_renderedPrompt: string,
	context?: CallApiContextParams,
): Promise<ProviderResponse> {
	const podcastEpisodeScriptVariables = context?.vars as PodcastEpisodeScriptVariables

	// write a full episode's outline, then every segment against the outline
	const scriptCallOptions = { ...podcastEpisodeScriptVariables, maxMinutes: FULL_PODCAST_EPISODE_MINUTES }
	const outlineCallResult = await generatePodcastEpisodeOutline(scriptCallOptions)
	const outline = outlineCallResult.scriptDraft
	const segmentCallResults = await Promise.all(
		outline.segments.map((_, segmentIndex) =>
			generatePodcastEpisodeSegment({ ...scriptCallOptions, outline, segmentIndex }),
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
