// the count that opens a subtable under its row: the number with a chevron that turns while the subtable is open
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { SubtableCountButton } from "./SubtableCountButton"

const meta = {
	title: "Table/SubtableCountButton",
	component: SubtableCountButton,
	args: { count: 4, isOpen: false, ariaLabel: "Show Model Watchers's members", onClick: fn() },
	argTypes: {
		count: { control: { type: "number", min: 0 } },
		isOpen: { control: "boolean" },
		ariaLabel: { control: "text" },
		onClick: { control: false },
	},
	// the table cards the count sits in
	parameters: { surface: "card" },
} satisfies Meta<typeof SubtableCountButton>

export default meta
type Story = StoryObj<typeof meta>

// a closed subtable, its chevron pointing down
export const Closed: Story = {}

// an open subtable, its chevron turned up
export const Open: Story = { args: { isOpen: true } }

// a count of zero, disabled and without a chevron
export const Zero: Story = { args: { count: 0, ariaLabel: "Show Model Watchers's topics" } }

// a count of several digits beside the chevron
export const LargeCount: Story = { args: { count: 1284 } }
