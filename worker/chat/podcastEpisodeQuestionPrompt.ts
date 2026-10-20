// the topic chat prompt's blocks for a question asked from the podcast player, the chat-podcast-episode fragment with
// the hosts spliced in and the chapter the question was asked during
import { toTranscriptTurn } from "@shared/podcastEpisodes"
import { toFindingMaterialLines } from "../podcast/generatePodcastEpisodeScript"
import { toPodcastEpisodeHostsBlock } from "../podcast/podcastEpisodeHosts"
import { fetchPromptTemplate } from "../prompts/fetch"
import { writePrompt } from "../prompts/write"
import type { PodcastEpisodeChapterContext } from "./retrievePodcastEpisodeChapter"

/**
 * Returns the chat-podcast-episode fragment with the hosts block spliced in for a question asked from the podcast
 * player, or an empty block without a fetch for any other chat turn.
 */
export async function toPodcastQuestionBlock(
	podcastEpisodeChapter: PodcastEpisodeChapterContext | undefined,
): Promise<string> {
	// a question asked from the chat reads no podcast block
	if (!podcastEpisodeChapter) {
		return ""
	}

	// the fragment with the hosts prompt spliced in
	const [podcastEpisodeFragment, hostsBlock] = await Promise.all([
		fetchPromptTemplate("chat-podcast-episode"),
		toPodcastEpisodeHostsBlock(),
	])
	return writePrompt(podcastEpisodeFragment.template, {}, { hostsBlock })
}

/**
 * Returns the chapter block: the chapter a question asked from the podcast player was asked during, with the podcast
 * episode and chapter titles, the lines as each host said them, and the finding the hosts read to write the chapter,
 * while the topic still has it.
 */
export function toPodcastEpisodeChapterBlock({
	podcastEpisodeTitle,
	chapterTitle,
	chapterPosition,
	turns,
	finding,
}: PodcastEpisodeChapterContext): string {
	// the titles, then each line under its host's name with its vocal tags left out
	const chapterLines = turns.map(toTranscriptTurn).map(({ speakerName, text }) => `${speakerName}: ${text}`)
	const chapterTitleAndLines = [
		`Episode: ${podcastEpisodeTitle}`,
		`Chapter ${chapterPosition + 1}: ${chapterTitle}`,
		"",
		"What the hosts said in this chapter:",
		...chapterLines,
	]

	// the finding the hosts read, or a line saying the topic no longer shows it if the finding was filtered out
	const findingLines = finding
		? ["The finding the hosts read for this chapter:", ...toFindingMaterialLines(finding)]
		: ["This chapter's finding is not shown in the topic."]
	return [...chapterTitleAndLines, "", ...findingLines].join("\n")
}
