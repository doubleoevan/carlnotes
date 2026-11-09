// the card primitive: the raised surface and its padded body
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Card, CardBody } from "./card"

const meta = {
	title: "Primitives/Card",
	component: Card,
	decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

// a card with a body of text
export const Default: Story = {
	render: () => (
		<Card>
			<CardBody>
				<span className="font-display text-lg">Home espresso</span>
				<span className="text-muted-foreground text-sm">Gear and technique, without the forum noise.</span>
			</CardBody>
		</Card>
	),
}
