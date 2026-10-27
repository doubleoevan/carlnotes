import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { CoffeeCup } from "./CoffeeCup"

// the component fixture and preview layout
const meta: Meta<typeof CoffeeCup> = {
	title: "Branding/CoffeeCup",
	component: CoffeeCup,
	args: { className: "text-primary-foreground" },
	decorators: [
		(Story) => (
			<View className="self-start rounded-full bg-primary p-3">
				<Story />
			</View>
		),
	],
	parameters: { webReference: "apps/web/src/components/branding/CoffeeCup.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Default: Story = {}
