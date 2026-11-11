// where the hosts turn to hot takes in each chapter of a podcast episode film. a chapter's hot takes come after its
// Finding, and the closing hot takes come after the last chapter, in the same recording as it

import type { PodcastEpisodeScript } from "@carlnotes/contracts/podcast"
import { PODCAST_SHOW_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { loadAiredSharedComments } from "@carlnotes/db/sharedComments"
import { isUsernameSpoken } from "../podcast/podcastEpisodeScript"
import { toVideoCaptionChapters, type VideoChapterRow } from "./topicPodcastEpisodeVideoInputs"
import { toVideoCaptionTurnTimes } from "./videoCaptions"
import type { LowerThirdText } from "./videoFrames"

// the lower third over a chapter's hot takes
export const HOT_TAKES_LOWER_THIRD_TEXT: LowerThirdText = { title: "Hot takes", detail: PODCAST_SHOW_NAME }

// the script, the film's chapters, the usernames whose hot takes the script reads, and the pauses in the audio
type ToHotTakesStartSecondsOptions = {
	script: PodcastEpisodeScript
	videoChapterRows: VideoChapterRow[]
	usernames: string[]
	pauseSeconds: number[]
}

/**
 * Returns where the hosts turn to hot takes in a podcast episode's audio, by the chapter's position.
 */
export async function loadHotTakesStartSeconds({
	podcastEpisodeId,
	...hotTakesScript
}: Omit<ToHotTakesStartSecondsOptions, "usernames"> & { podcastEpisodeId: string }): Promise<Map<number, number>> {
	// the writers of the hot takes that the script reads
	const airedSharedComments = await loadAiredSharedComments(podcastEpisodeId)
	const usernames = airedSharedComments.flatMap(({ username }) => username ?? [])
	return toHotTakesStartSeconds({ ...hotTakesScript, usernames })
}

/**
 * Returns where the hosts turn to hot takes in each chapter that has any, by the chapter's position: the start of the
 * first turn that names a hot take's writer, or the start of the closing turns if they name one first.
 */
export function toHotTakesStartSeconds({
	script,
	videoChapterRows,
	usernames,
	pauseSeconds,
}: ToHotTakesStartSecondsOptions): Map<number, number> {
	// a script that reads no hot take has none to turn to
	const hotTakesStartSeconds = new Map<number, number>()
	if (usernames.length === 0) {
		return hotTakesStartSeconds
	}

	// the closing turns open the script's sign-off, which the last chapter's recording ends on
	const captionChapters = toVideoCaptionChapters(script, videoChapterRows)
	const lastPosition = Math.max(...videoChapterRows.map((videoChapterRow) => videoChapterRow.position))
	videoChapterRows.forEach(({ position }, i) => {
		// ponytail: a username that is also an ordinary word starts the hot takes at that word. the script could store
		// each hot take's turns if that happens
		const captionChapter = captionChapters[i]
		const namedTurnIndex =
			captionChapter?.turns.findIndex((turn) => usernames.some((username) => isUsernameSpoken(turn.text, username))) ??
			-1
		if (!captionChapter || namedTurnIndex < 0) {
			return
		}

		// the closing turns start with the hand-off into them, before the turn that names a writer
		const closingTurnIndex = captionChapter.turns.length - (position === lastPosition ? script.signOff.length : 0)
		const hotTakesTurnIndex = Math.min(namedTurnIndex, closingTurnIndex)

		// the hot takes start where that turn does
		const hotTakesTurnTime = toVideoCaptionTurnTimes(captionChapter, pauseSeconds)[hotTakesTurnIndex]
		if (hotTakesTurnTime) {
			hotTakesStartSeconds.set(position, hotTakesTurnTime.startSeconds)
		}
	})
	return hotTakesStartSeconds
}
