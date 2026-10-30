import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { PushPermissionPrompt } from "./PushNotifications"

// the sheet a first follow or room visit opens, with the system prompt left out. the web has no push, so its
// reference is the Terms sheet whose layout and choice order it follows
const meta = {
	title: "Push/PushPermissionPrompt",
	component: PushPermissionPromptExample,
	parameters: {
		webReference:
			"none: the web has no push. Native layout follows apps/mobile/src/components/session/TermsAcceptanceSheet.tsx",
	},
} satisfies Meta<typeof PushPermissionPromptExample>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

// the sheet over a trigger, which shows the choice made after it closes
function PushPermissionPromptExample() {
	const [isOpen, setIsOpen] = useState(true)
	const [choice, setChoice] = useState<string | null>(null)
	return (
		<View className="gap-3">
			<Button accessibilityLabel="Open the notification sheet" onPress={() => setIsOpen(true)}>
				<Text>Open the notification sheet</Text>
			</Button>
			{choice && <Text>{choice}</Text>}
			{isOpen && (
				<PushPermissionPrompt
					onChoose={(isAccepted) => {
						setIsOpen(false)
						setChoice(isAccepted ? "Turned on" : "Not now")
					}}
				/>
			)}
		</View>
	)
}
