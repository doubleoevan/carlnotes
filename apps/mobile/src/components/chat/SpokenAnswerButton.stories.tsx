import type { Meta, StoryObj } from "@storybook/react-native"
import { SpokenAnswerControl } from "./SpokenAnswerButton"

// the component fixture and preview layout
const meta: Meta<typeof SpokenAnswerControl> = {
	title: "Chat/SpokenAnswerButton",
	component: SpokenAnswerControl,
	args: { spokenAnswerState: "idle", onToggle: () => {} },
	parameters: { webReference: "apps/web/src/components/chat/SpokenAnswerButton.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Idle: Story = {}
export const Loading: Story = { args: { spokenAnswerState: "loading" } }
export const Playing: Story = { args: { spokenAnswerState: "playing" } }
