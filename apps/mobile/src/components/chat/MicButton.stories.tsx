import type { Meta, StoryObj } from "@storybook/react-native"
import { MicButton } from "./MicButton"
import { toStoryVoiceRecording } from "./voiceRecordingStoryFixtures"

// the component fixture and preview layout
const meta: Meta<typeof MicButton> = {
	title: "Chat/MicButton",
	component: MicButton,
	args: { voiceRecording: toStoryVoiceRecording() },
	parameters: { webReference: "apps/web/src/components/chat/MicButton.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Idle: Story = {}
export const Listening: Story = { args: { voiceRecording: toStoryVoiceRecording({ isListening: true }) } }
export const Requesting: Story = { args: { voiceRecording: toStoryVoiceRecording({ state: "requesting" }) } }
export const Transcribing: Story = { args: { voiceRecording: toStoryVoiceRecording({ state: "transcribing" }) } }
