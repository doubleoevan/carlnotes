// the chat question notes: the attachment note and the podcast episode note that a stored question ends with, written
// and read back
import { type PodcastEpisodeSpeaker, podcastEpisodeSpeakers } from "./enums"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "./podcastEpisodes"
import { toOneLineText } from "./text"

/**
 * Returns a question with its attachments named in a trailing note.
 */
export function withAttachmentNote(question: string, attachments: { name: string }[]): string {
	if (attachments.length === 0) {
		return question
	}
	const attachmentNote = `[attached: ${attachments.map((attachment) => attachment.name).join(", ")}]`
	return withTrailingNote({ question, note: attachmentNote })
}

// the attachment note that ends a question sent with files. it is the question's last line, so a file name may hold "]"
const ATTACHMENT_NOTE_PATTERN = /(?:^|\n\n)\[attached: [^\n]*\]$/

/**
 * Returns a question without the trailing attachment note that withAttachmentNote writes.
 */
export function withoutAttachmentNote(question: string): string {
	return question.replace(ATTACHMENT_NOTE_PATTERN, "")
}

// the longest chapter title a podcast episode note keeps
export const PODCAST_EPISODE_NOTE_CHAPTER_TITLE_CHARS = 120

// what a question asked from the podcast player was asked during, and who answered it
export type PodcastEpisodeNote = {
	podcastEpisodeTitle: string
	chapterPosition: number
	chapterTitle: string
	speaker: PodcastEpisodeSpeaker
}

// the note that ends a question asked from the podcast player, read back by its parts
const PODCAST_EPISODE_NOTE_PATTERN =
	/(?:^|\n\n)\[asked while listening to "([^\n]*)", chapter (\d+), "([^\n]*)"; (\w+) answered\]$/

/**
 * Returns a question with a trailing note naming its podcast episode, chapter, and speaker.
 */
export function withPodcastEpisodeNote(
	question: string,
	{ podcastEpisodeTitle, chapterPosition, chapterTitle, speaker }: PodcastEpisodeNote,
): string {
	// one line each for the titles, with the chapter title cut to its limit
	const podcastEpisodeTitleOnOneLine = toOneLineText(podcastEpisodeTitle)
	const chapterTitleOnOneLine = toOneLineText(chapterTitle).slice(0, PODCAST_EPISODE_NOTE_CHAPTER_TITLE_CHARS)
	const podcastEpisodeNote = `[asked while listening to "${podcastEpisodeTitleOnOneLine}", chapter ${chapterPosition + 1}, "${chapterTitleOnOneLine}"; ${PODCAST_EPISODE_SPEAKER_NAMES[speaker]} answered]`
	return withTrailingNote({ question, note: podcastEpisodeNote })
}

/**
 * Returns a question with a note after a blank line, or the note alone for an empty question.
 */
export function withTrailingNote({ question, note }: { question: string; note: string }): string {
	return question === "" ? note : `${question}\n\n${note}`
}

/**
 * Splits a stored question into its words and its podcast episode note, or returns the question whole and no note.
 */
export function toPodcastEpisodeNoteParts(question: string): {
	question: string
	podcastEpisodeNote: PodcastEpisodeNote | null
} {
	// a question with no note, or with a note that names no host, is returned as it is
	const noteMatch = question.match(PODCAST_EPISODE_NOTE_PATTERN)
	const [, podcastEpisodeTitle = "", chapterNumber = "1", chapterTitle = "", speakerName = ""] = noteMatch ?? []
	const speaker = toPodcastEpisodeSpeaker(speakerName)
	if (!noteMatch || !speaker) {
		return { question, podcastEpisodeNote: null }
	}

	// the words before the note, and the note's parts
	return {
		question: question.slice(0, noteMatch.index),
		podcastEpisodeNote: { podcastEpisodeTitle, chapterPosition: Number(chapterNumber) - 1, chapterTitle, speaker },
	}
}

// the speaker a host's name in a note stands for, or null for a name that is no host's
function toPodcastEpisodeSpeaker(speakerName: string): PodcastEpisodeSpeaker | null {
	return podcastEpisodeSpeakers.find((speaker) => PODCAST_EPISODE_SPEAKER_NAMES[speaker] === speakerName) ?? null
}
