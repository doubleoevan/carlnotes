import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { CoffeeCup } from "./CoffeeCup"

const meta: Meta<typeof CoffeeCup> = {
	title: "Branding/CoffeeCup",
	component: CoffeeCup,
	args: { className: "text-primary-foreground" },
	decorators: [
		(Story) => (
			<div className="w-fit rounded-full bg-primary p-3">
				<Story />
			</div>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
