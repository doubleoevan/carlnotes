import type { Meta, StoryObj } from "@storybook/react-native"
import { Globe, Lock, Mail } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { ChoiceSelect } from "./ChoiceSelect"

// keep labels and both icons readable even when the trigger shares a narrow form row
const meta: Meta<typeof ChoiceSelect> = {
	title: "Common/ChoiceSelect",
	component: ChoiceSelect,
	parameters: { webReference: "apps/web/src/components/topic/EditTopicModal.tsx at 375px" },
	render: function Example() {
		const [selectedConversationValue, setSelectedConversationValue] = useState("invite")
		return (
			<View className="w-40">
				<ChoiceSelect
					label="Visibility"
					value={selectedConversationValue}
					onChange={setSelectedConversationValue}
					options={[
						{ value: "private", label: "private", icon: Lock },
						{ value: "public", label: "public", icon: Globe },
						{ value: "invite", label: "invite", icon: Mail },
					]}
				/>
			</View>
		)
	},
}
export default meta
type Story = StoryObj<typeof meta>
export const Visibility: Story = {}

export const WithAvatar: Story = {
	render: function Example() {
		const [selectedConversationValue, setSelectedConversationValue] = useState("team")
		return (
			<ChoiceSelect
				label="Choose conversation"
				presentation="sheet"
				value={selectedConversationValue}
				onChange={setSelectedConversationValue}
				options={[
					{
						value: "team",
						label: "Coffee Club",
						icon: <Avatar ownerId="story-team" name="Coffee Club" imageUrl={null} size={20} />,
					},
					{ value: "private", label: "Private conversation", icon: Lock },
				]}
			/>
		)
	},
}

// keep a long conversation list scrollable within the safe area
export const ManyConversations: Story = {
	render: function Example() {
		const [selectedConversationValue, setSelectedConversationValue] = useState("0")
		return (
			<ChoiceSelect
				label="Choose conversation"
				presentation="sheet"
				value={selectedConversationValue}
				onChange={setSelectedConversationValue}
				options={Array.from({ length: 24 }, (_, index) => ({
					value: String(index),
					label: `Reading group ${index + 1} · A Topic with a longer name`,
					icon: Lock,
				}))}
			/>
		)
	},
}
