// the hosts block that every prompt the two hosts speak in splices: who they are, how each one talks, and the speaker
// value that each host's lines have
import { toPodcastEpisodeSpeakersSentence } from "@carlnotes/contracts/podcastEpisodes"
import { fetchPromptTemplate } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"

/**
 * Returns the hosts prompt written with each host's speaker value.
 */
export async function toPodcastEpisodeHostsBlock(): Promise<string> {
	const { template } = await fetchPromptTemplate("podcast-episode-hosts")
	return writePrompt(template, {}, { podcastEpisodeSpeakers: toPodcastEpisodeSpeakersSentence() })
}
