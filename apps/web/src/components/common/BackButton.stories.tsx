// the back button: the only way back in a place with no browser back
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { BackButton } from "./BackButton"

const meta = {
	title: "Common/BackButton",
	component: BackButton,
	args: { onClick: fn() },
} satisfies Meta<typeof BackButton>

export default meta
type Story = StoryObj<typeof meta>

// the plain label
export const Default: Story = {}

// a label that names where it returns to
export const NamedPlace: Story = { args: { label: "Back to topics" } }
