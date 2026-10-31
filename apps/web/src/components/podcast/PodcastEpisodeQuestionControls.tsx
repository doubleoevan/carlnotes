import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	toPodcastEpisodeQuestionRecordingOptions,
	usePodcastEpisodeQuestionButton,
} from "@carlnotes/core/hooks/usePodcastEpisodeQuestionButton"
import {
	PODCAST_EPISODE_QUESTION_BUTTON_LABEL,
	toPodcastEpisodeQuestionStopLabel,
} from "@carlnotes/core/stores/podcastEpisodeQuestionRules"
import {
	endPodcastEpisodeQuestion,
	usePodcastEpisodeQuestion,
} from "@carlnotes/core/stores/podcastEpisodeQuestionStore"
import { useNavigate } from "@tanstack/react-router"
import { ArrowUp, LoaderCircle, Mic, X } from "lucide-react"
import { useVoiceRecording } from "@/components/chat/useVoiceRecording"
import { IconButton } from "@/components/common/IconButton"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { PODCAST_EPISODE_QUESTION_BUTTON_CLASS } from "@/lib/styleClasses"

export {
	isPodcastEpisodeQuestionButtonShown,
	PODCAST_EPISODE_QUESTION_BUTTON_LABEL,
} from "@carlnotes/core/stores/podcastEpisodeQuestionRules"

/**
 * The mic that asks carl and vienna about the loaded podcast episode. A tap pauses the podcast episode and records, the
 * recording ends itself once the user stops talking, and every podcast mic slot turns into send while it records. A
 * visitor's tap routes to signup.
 */
export function PodcastEpisodeQuestionButton({
	podcastEpisode,
	className = PODCAST_EPISODE_QUESTION_BUTTON_CLASS,
}: {
	podcastEpisode: PodcastEpisode
	// the round button beside play by default, or the card's own control shape
	className?: string
}) {
	// the recording that ends itself on the voice activity detector, and the slot's state and press
	const navigate = useNavigate()
	const voiceRecording = useVoiceRecording(toPodcastEpisodeQuestionRecordingOptions(podcastEpisode))
	const { buttonState, pressButton } = usePodcastEpisodeQuestionButton({
		voiceRecording,
		onSignUp: () => void navigate(toSignupNavigation("podcast-question")),
	})

	// while the question records, from this mic or another, the slot sends early
	if (buttonState === "send") {
		return (
			<IconButton tooltip="Send" onClick={pressButton} className={className}>
				<ArrowUp className="size-4.5" />
			</IconButton>
		)
	}

	// the microphone request, the transcript, and the wait for the answer show a spinner in every podcast mic slot, and
	// every mic on the page stays off while a question is in progress
	return (
		<IconButton
			tooltip={PODCAST_EPISODE_QUESTION_BUTTON_LABEL}
			onClick={pressButton}
			isDisabled={buttonState !== "mic"}
			className={className}
		>
			{buttonState === "waiting" ? <LoaderCircle className="size-4.5 animate-spin" /> : <Mic className="size-4.5" />}
		</IconButton>
	)
}

/**
 * The stop that takes the skip buttons' place while a question is in progress. It cancels a recording and stops the
 * wait or the answer, and the podcast episode resumes.
 */
export function PodcastEpisodeQuestionStopButton() {
	const { phase } = usePodcastEpisodeQuestion()
	return (
		<IconButton
			tooltip={toPodcastEpisodeQuestionStopLabel(phase)}
			onClick={() => endPodcastEpisodeQuestion("stopped")}
			className={PODCAST_EPISODE_QUESTION_BUTTON_CLASS}
		>
			<X className="size-4.5" />
		</IconButton>
	)
}
