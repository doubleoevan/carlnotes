import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	toPodcastEpisodeQuestionRecordingOptions,
	usePodcastEpisodeQuestionButton,
} from "@carlnotes/core/hooks/usePodcastEpisodeQuestionButton"
import {
	PODCAST_EPISODE_QUESTION_BUTTON_LABEL,
	type PodcastEpisodeQuestionButtonState,
	type PodcastEpisodeQuestionPhase,
	toPodcastEpisodeQuestionStopLabel,
} from "@carlnotes/core/stores/podcastEpisodeQuestionRules"
import {
	endPodcastEpisodeQuestion,
	usePodcastEpisodeQuestion,
} from "@carlnotes/core/stores/podcastEpisodeQuestionStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { usePathname } from "expo-router"
import { ArrowUp, Mic, X } from "lucide-react-native"
import { useVoiceRecording } from "@/components/chat/useVoiceRecording"
import { ThemedSpinner } from "@/components/common/ThemedSpinner"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { openSessionScreen } from "@/sessionReturnPath"

export { isPodcastEpisodeQuestionButtonShown } from "@carlnotes/core/stores/podcastEpisodeQuestionRules"

// the round button beside play in the dock, the web's question button
export const PODCAST_EPISODE_QUESTION_BUTTON_CLASS = "size-11 rounded-full bg-muted p-0 active:bg-accent"

/**
 * Shows the web's mic that asks carl and vienna about the loaded podcast episode. A tap pauses the podcast episode and
 * records, the recording ends itself once the user stops talking, and every podcast mic slot turns into Send while it
 * records. A visitor's tap opens sign-up with the web's podcast question prompt.
 */
export function PodcastEpisodeQuestionButton({
	podcastEpisode,
	className = PODCAST_EPISODE_QUESTION_BUTTON_CLASS,
}: {
	podcastEpisode: PodcastEpisode
	// the round button beside play by default, or the card's playback control shape
	className?: string
}) {
	// the recording that ends itself on the level's silence and sends its transcript to the question
	const pathname = usePathname()
	const voiceRecording = useVoiceRecording(toPodcastEpisodeQuestionRecordingOptions(podcastEpisode))
	const { buttonState, pressButton } = usePodcastEpisodeQuestionButton({
		voiceRecording,
		onSignUp: () => openSessionScreen({ screen: "/sign-up", returnPath: pathname, cta: "podcast-question" }),
	})
	return <PodcastEpisodeQuestionControl buttonState={buttonState} onPress={pressButton} className={className} />
}

/**
 * Draws the podcast mic slot: Send while the question records, a spinner while it waits, the mic turned off while an
 * answer plays, or the mic.
 */
export function PodcastEpisodeQuestionControl({
	buttonState,
	onPress,
	className = PODCAST_EPISODE_QUESTION_BUTTON_CLASS,
}: {
	buttonState: PodcastEpisodeQuestionButtonState
	onPress: () => void
	className?: string
}) {
	// the slot sends early while the question records
	if (buttonState === "send") {
		return (
			<Button variant="ghost" size="icon" accessibilityLabel="Send" onPress={onPress} className={className}>
				<Icon as={ArrowUp} className="size-4.5 text-foreground" />
			</Button>
		)
	}

	// the microphone request, the transcript, and the wait for the answer show a spinner, and the mic stays off while a
	// question is in progress
	const isDisabled = buttonState !== "mic"
	return (
		<Button
			variant="ghost"
			size="icon"
			accessibilityLabel={PODCAST_EPISODE_QUESTION_BUTTON_LABEL}
			accessibilityState={{ busy: buttonState === "waiting", disabled: isDisabled }}
			disabled={isDisabled}
			onPress={onPress}
			className={cn(className, isDisabled && "opacity-40")}
		>
			{buttonState === "waiting" ? (
				<ThemedSpinner color="foreground" />
			) : (
				<Icon as={Mic} className="size-4.5 text-foreground" />
			)}
		</Button>
	)
}

/**
 * Shows the web's stop that takes the skip buttons' place while a question is in progress. It cancels a recording and
 * stops the wait or the answer, and the podcast episode resumes.
 */
export function PodcastEpisodeQuestionStopButton() {
	const { phase } = usePodcastEpisodeQuestion()
	return <PodcastEpisodeQuestionStopControl phase={phase} onPress={() => endPodcastEpisodeQuestion("stopped")} />
}

/**
 * Draws the question's stop for its phase: Cancel while it listens, then Stop.
 */
export function PodcastEpisodeQuestionStopControl({
	phase,
	onPress,
}: {
	phase: PodcastEpisodeQuestionPhase
	onPress: () => void
}) {
	return (
		<Button
			variant="ghost"
			size="icon"
			accessibilityLabel={toPodcastEpisodeQuestionStopLabel(phase)}
			onPress={onPress}
			className={PODCAST_EPISODE_QUESTION_BUTTON_CLASS}
		>
			<Icon as={X} className="size-4.5 text-foreground" />
		</Button>
	)
}
