import type { Meta, StoryObj } from "@storybook/react-native"
import { Globe, Lock, Mail } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { ChoiceSelect } from "./ChoiceSelect"

// keep labels and both icons readable even when the trigger shares a narrow form row
const meta: Meta<typeof ChoiceSelect> = {
	title: "Common/ChoiceSelect",
	component: ChoiceSelect,
	parameters: { webReference: "apps/web/src/components/topic/EditTopicModal.tsx at 375px" },
	render: function Example() {
		const [value, setValue] = useState("invite")
		return (
			<View className="w-40">
				<ChoiceSelect
					label="Visibility"
					value={value}
					onChange={setValue}
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
