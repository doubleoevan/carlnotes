import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { RecordingBar } from "./RecordingBar"
import { toStoryVoiceRecording } from "./voiceRecordingStoryFixtures"

// the component fixture and preview layout, at a phone's width inside the composer's frame
const meta: Meta<typeof RecordingBar> = {
	title: "Chat/RecordingBar",
	component: RecordingBar,
	args: { voiceRecording: toStoryVoiceRecording({ state: "recording" }) },
	parameters: { webReference: "apps/web/src/components/chat/RecordingBar.tsx at 375px" },
	decorators: [
		(Story) => (
			<View className="min-h-16 w-full max-w-[375px] flex-row items-center rounded-xl border border-border bg-bubble p-2">
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states, from silence to a full meter past a minute
export const Silent: Story = {}
export const Speaking: Story = {
	args: { voiceRecording: toStoryVoiceRecording({ state: "recording", level: 0.45, secondsElapsed: 7 }) },
}
export const Loud: Story = {
	args: { voiceRecording: toStoryVoiceRecording({ state: "recording", level: 1, secondsElapsed: 64 }) },
}
