import type { Meta, StoryObj } from "@storybook/react-native"
import { type ComponentProps, type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { TopicEditorChoiceSheet } from "./TopicEditorChoiceSheet"

// the choice for a new topic, a new topic from a team, and an edit, each opened from a trigger
const meta = {
	title: "Topic/TopicEditorChoiceSheet",
	component: ChoiceExample,
	parameters: { webReference: "apps/web/src/components/topic/TopicEditorChoiceDialog.tsx, as a native bottom sheet" },
} satisfies Meta<typeof ChoiceExample>
export default meta
type Story = StoryObj<typeof meta>
export const NewTopic: Story = { args: {} }
export const NewTopicFromTeam: Story = { args: { initialTeam: { teamId: "story-team", name: "Roasters" } } }
export const EditTopic: Story = { args: { topicId: "story-topic" } }

// mount the sheet from a persistent trigger, so closing it returns focus there
function ChoiceExample(props: Pick<ComponentProps<typeof TopicEditorChoiceSheet>, "topicId" | "initialTeam">) {
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<View>
			<Button ref={triggerRef} accessibilityLabel="Open the choice" onPress={() => setIsOpen(true)}>
				<Text>{props.topicId ? "Edit topic" : "New Topic"}</Text>
			</Button>
			{isOpen && (
				<TopicEditorChoiceSheet
					{...props}
					onChooseTopicForm={() => setIsOpen(false)}
					onClose={() => setIsOpen(false)}
				/>
			)}
		</View>
	)
}
