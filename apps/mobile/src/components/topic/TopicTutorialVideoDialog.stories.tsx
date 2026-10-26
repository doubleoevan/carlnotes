import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { TopicTutorialVideoDialog } from "./TopicTutorialVideoDialog"

// the web's shared tutorial keeps its video identity in the native sheet
const meta = {
	title: "Topic/TopicTutorialVideoDialog",
	component: TutorialExample,
	parameters: {
		webReference: "apps/web/src/components/topic/TopicTutorialVideoDialog.tsx; common-youtubeplayer--thumbnail",
	},
} satisfies Meta<typeof TutorialExample>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

// start a fresh play recorder on every opening
function TutorialExample() {
	const [isOpen, setIsOpen] = useState(false)
	return (
		<>
			<Button accessibilityLabel="Watch Brew with Carl" onPress={() => setIsOpen(true)}>
				<Text>Watch Brew with Carl</Text>
			</Button>
			{isOpen ? <TopicTutorialVideoDialog opener="mobile-settings" onClose={() => setIsOpen(false)} /> : null}
		</>
	)
}
