import type { PodcastEpisode } from "@shared/contracts/podcast"
import { useNavigate } from "@tanstack/react-router"
import { ArrowUp, LoaderCircle, Mic, X } from "lucide-react"
import { useEffect } from "react"
import { authClient } from "@/clients/authClient"
import { toVoiceChatPage } from "@/clients/voiceClient"
import { useVoiceRecording } from "@/components/chat/useVoiceRecording"
import { IconButton } from "@/components/common/IconButton"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { PODCAST_EPISODE_QUESTION_BUTTON_CLASS } from "@/lib/styleClasses"
import {
	askPodcastEpisodeQuestion,
	endPodcastEpisodeQuestion,
	loadPodcastEpisodeQuestionConversation,
	markPodcastEpisodeQuestionRecording,
	sendPodcastEpisodeQuestionRecording,
	startPodcastEpisodeQuestion,
	toastSpentBudget,
	usePodcastEpisodeQuestion,
} from "@/stores/podcastEpisodeQuestionStore"

// the mic's accessible name and tooltip
export const PODCAST_EPISODE_QUESTION_LABEL = "Talk with Carl and Vienna"

/**
 * Returns whether the podcast episode shows the mic that asks carl and vienna: voice is on and the podcast episode has
 * a topic.
 */
export function isPodcastEpisodeQuestionButtonShown(podcastEpisode: PodcastEpisode): boolean {
	return podcastEpisode.isVoiceChatConfigured && podcastEpisode.topicId !== ""
}

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
	const navigate = useNavigate()
	const { phase, isVoiceRecording } = usePodcastEpisodeQuestion()
	const { data: session } = authClient.useSession()

	// the recording that ends itself on the voice activity detector and sends its transcript to the question
	const voiceRecording = useVoiceRecording({
		page: toVoiceChatPage({ topicId: podcastEpisode.topicId }),
		isPodcastEpisodeQuestion: true,
		canStartVoiceRecording: loadPodcastEpisodeQuestionConversation,
		onTranscript: (transcript, spokenQuestionTimings) =>
			void askPodcastEpisodeQuestion(transcript, spokenQuestionTimings),
		onBudgetRejected: toastSpentBudget,
		onVoiceRecordingEnded: () => endPodcastEpisodeQuestion("stopped"),
	})

	// this mic's running recording marks the question as recording, so every other podcast mic slot shows its send too
	const isThisMicRecording = voiceRecording.state === "recording"
	useEffect(() => {
		if (!isThisMicRecording) {
			return
		}
		return markPodcastEpisodeQuestionRecording()
	}, [isThisMicRecording])

	// a visitor goes to signup, and a user's tap starts the question and the recording inside the tap's gesture
	function handleMicTap(): void {
		if (!session) {
			void navigate(toSignupNavigation("podcast-question"))
			return
		}
		if (startPodcastEpisodeQuestion(voiceRecording)) {
			voiceRecording.start()
		}
	}

	// while the question records, from this mic or another, the slot sends early
	if (isThisMicRecording || isVoiceRecording) {
		return (
			<IconButton tooltip="Send" onClick={sendPodcastEpisodeQuestionRecording} className={className}>
				<ArrowUp className="size-4.5" />
			</IconButton>
		)
	}

	// the microphone request, the transcript, and the wait for the answer show a spinner in every podcast mic slot, and
	// every mic on the page stays off while a question is in progress
	const isWaiting = voiceRecording.state !== "idle" || phase === "listening" || phase === "thinking"
	return (
		<IconButton
			tooltip={PODCAST_EPISODE_QUESTION_LABEL}
			onClick={handleMicTap}
			isDisabled={isWaiting || phase !== "idle"}
			className={className}
		>
			{isWaiting ? <LoaderCircle className="size-4.5 animate-spin" /> : <Mic className="size-4.5" />}
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
			tooltip={phase === "listening" ? "Cancel" : "Stop"}
			onClick={() => endPodcastEpisodeQuestion("stopped")}
			className={PODCAST_EPISODE_QUESTION_BUTTON_CLASS}
		>
			<X className="size-4.5" />
		</IconButton>
	)
}
