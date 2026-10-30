// the podcast mic: whether a podcast episode shows it, and what every podcast mic slot shows while a question records
import { afterEach, expect, mock, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import {
	endPodcastEpisodeQuestion,
	markPodcastEpisodeQuestionRecording,
	startPodcastEpisodeQuestion,
} from "@/stores/podcastEpisodeQuestionStore"
import { spyOnPodcastEpisodePlayer, toVoiceRecordingMock } from "@/stores/podcastEpisodeQuestionTestFixtures"
import {
	isPodcastEpisodeQuestionButtonShown,
	PODCAST_EPISODE_QUESTION_LABEL,
	PodcastEpisodeQuestionButton,
} from "./PodcastEpisodeQuestionControls"

// end any question a test left in progress, then put the player store's spies back
afterEach(() => {
	endPodcastEpisodeQuestion("stopped")
	mock.restore()
})

// a podcast episode on a topic, with voice on
const podcastEpisode = toPodcastEpisodeFixture()

test("isPodcastEpisodeQuestionButtonShown shows the mic if voice is on and the podcast episode has a topic", () => {
	expect(isPodcastEpisodeQuestionButtonShown(podcastEpisode)).toBe(true)
	expect(isPodcastEpisodeQuestionButtonShown({ ...podcastEpisode, isVoiceChatConfigured: false })).toBe(false)
	expect(isPodcastEpisodeQuestionButtonShown({ ...podcastEpisode, topicId: "" })).toBe(false)
})

test("a podcast mic slot shows send while another mic's recording runs, and a spinner while it waits", async () => {
	// the podcast episode is loaded and playing, and its pause and resume do nothing here
	spyOnPodcastEpisodePlayer({ podcastEpisode, isPlaying: true })

	// with no question, the slot is the mic
	const podcastEpisodeQuestionButton = <PodcastEpisodeQuestionButton podcastEpisode={podcastEpisode} />
	const idleMarkup = await renderWithRouter(podcastEpisodeQuestionButton)
	expect(idleMarkup).toContain(`aria-label="${PODCAST_EPISODE_QUESTION_LABEL}"`)
	expect(idleMarkup).not.toContain('disabled=""')

	// another mic's question that waits on the microphone shows a disabled spinner here
	startPodcastEpisodeQuestion(toVoiceRecordingMock())
	const waitingMarkup = await renderWithRouter(podcastEpisodeQuestionButton)
	expect(waitingMarkup).toContain('disabled=""')
	expect(waitingMarkup).toContain("animate-spin")

	// once that mic records, this slot is the send control
	markPodcastEpisodeQuestionRecording()
	const recordingMarkup = await renderWithRouter(podcastEpisodeQuestionButton)
	expect(recordingMarkup).toContain('aria-label="Send"')
	expect(recordingMarkup).not.toContain(PODCAST_EPISODE_QUESTION_LABEL)
})
