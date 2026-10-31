import { PodcastPlayer as SharedPodcastPlayer } from "@carlnotes/core/components/PodcastPlayer"
import { PODCAST_STORY_EPISODE, PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import {
	type PodcastEpisodeQuestionPhase,
	toPodcastEpisodeQuestionButtonState,
} from "@carlnotes/core/stores/podcastEpisodeQuestionRules"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { MOBILE_PLAYBACK_CONTROL_BUTTON_CLASS } from "./PlaybackControlButtons"
import { PodcastEpisodeQuestionControl, PodcastEpisodeQuestionStopControl } from "./PodcastEpisodeQuestionControls"
import { podcastPlayerElements } from "./PodcastPlayer"

// the component fixture and preview layout
const meta: Meta<typeof PodcastEpisodeQuestionControl> = {
	title: "Podcast/PodcastEpisodeQuestionControls",
	component: PodcastEpisodeQuestionControl,
	args: { buttonState: "mic", onPress: () => {} },
	parameters: { webReference: "apps/web/src/components/podcast/PodcastEpisodeQuestionControls.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>
// the dock's mic slot in each state, and the card's control shape
export const Mic: Story = {}
export const Waiting: Story = { args: { buttonState: "waiting" } }
export const Send: Story = { args: { buttonState: "send" } }
export const Answering: Story = { args: { buttonState: "disabled" } }
export const CardMic: Story = { args: { className: MOBILE_PLAYBACK_CONTROL_BUTTON_CLASS } }

// the dock in each phase: the phase in the chapter line, the stop in the skips' place, and the mic slot's state
export const DockListening: Story = {
	render: () => <PodcastEpisodeQuestionDock phaseLabel="Listening" phase="listening" />,
}
export const DockThinking: Story = {
	render: () => <PodcastEpisodeQuestionDock phaseLabel="Thinking" phase="thinking" />,
}
export const DockCarlAnswering: Story = {
	render: () => <PodcastEpisodeQuestionDock phaseLabel="Carl's answering" phase="answering" />,
}
export const DockViennaAnswering: Story = {
	render: () => <PodcastEpisodeQuestionDock phaseLabel="Vienna's answering" phase="answering" />,
}

// the real dock over a playing story podcast episode, with the question's controls in one phase. a listening question is
// recording, so its mic slot sends
function PodcastEpisodeQuestionDock({ phaseLabel, phase }: { phaseLabel: string; phase: PodcastEpisodeQuestionPhase }) {
	const isRecording = phase === "listening"
	const buttonState = toPodcastEpisodeQuestionButtonState({
		voiceRecordingState: isRecording ? "recording" : "idle",
		phase,
		isVoiceRecording: isRecording,
	})
	const elements = {
		...podcastPlayerElements,
		Controls: () => (
			<>
				<PodcastEpisodeQuestionStopControl phase={phase} onPress={() => {}} />
				<PodcastEpisodeQuestionControl buttonState={buttonState} onPress={() => {}} />
			</>
		),
	}
	return (
		<PodcastEpisodeStory episode={{ ...PODCAST_STORY_EPISODE, isVoiceChatConfigured: true }} state="playing">
			<View className="w-full">
				<SharedPodcastPlayer phaseLabel={phaseLabel} elements={elements} />
			</View>
		</PodcastEpisodeStory>
	)
}
