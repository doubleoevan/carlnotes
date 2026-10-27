import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { ChatComposer } from "./ChatComposer"

// the component fixture and preview layout
const meta: Meta<typeof ChatComposer> = {
	title: "Chat/ChatComposer",
	component: ChatComposer,
	args: { value: "", onChange: () => {}, onSend: () => {}, onStop: () => {} },
	parameters: { webReference: "apps/web/src/components/chat/ChatComposer.tsx" },
	decorators: [
		(Story) => (
			<View className="w-full">
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Empty: Story = { render: () => <EditableComposer /> }
export const LongQuestion: Story = {
	args: {
		value:
			"What changed in the sources this week? Please compare their evidence, include the reasons for disagreement, and suggest one useful question to ask next. ".repeat(
				5,
			),
	},
}
export const Streaming: Story = { args: { isStreaming: true } }
export const Unavailable: Story = { args: { isDisabled: true } }

// keep typing local to the story, including software and hardware keyboard checks
function EditableComposer() {
	const [question, setQuestion] = useState("")
	return <ChatComposer value={question} onChange={setQuestion} onSend={() => setQuestion("")} />
}
