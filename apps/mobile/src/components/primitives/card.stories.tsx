// the mobile Card: the raised surface and its padded body, with the web story's name
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { Card, CardBody } from "./card"
import { Text } from "./text"

const meta = {
	title: "Primitives/Card",
	component: Card,
	parameters: { webReference: "apps/web/src/components/primitives/card.stories.tsx" },
	render: () => (
		<View className="w-80">
			<Card>
				<CardBody>
					<Text className="font-display text-lg">Home espresso</Text>
					<Text className="text-muted-foreground text-sm">Gear and technique, without the forum noise.</Text>
				</CardBody>
			</Card>
		</View>
	),
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

// a card with a body of text
export const Default: Story = {}
