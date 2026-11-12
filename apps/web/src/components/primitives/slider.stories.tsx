// the slider primitive: a range input with one thumb per value, named by an aria-label
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import type * as React from "react"
import { fn } from "storybook/test"
import { Slider } from "./slider"

// the slider's props, named so the meta's type is portable
type SliderStoryArgs = React.ComponentProps<typeof Slider>

const meta: Meta<SliderStoryArgs> = {
	title: "Primitives/Slider",
	component: Slider,
	args: {
		defaultValue: [30],
		min: 1,
		max: 30,
		step: 1,
		disabled: false,
		"aria-label": "Past days",
		onValueChange: fn(),
	},
	argTypes: {
		min: { control: "number" },
		max: { control: "number" },
		step: { control: "number" },
		disabled: { control: "boolean" },
		"aria-label": { control: "text" },
		onValueChange: { control: false },
		asChild: { control: false },
	},
	render: (args) => (
		<div className="w-64">
			<Slider {...args} />
		</div>
	),
}

export default meta
type Story = StoryObj<typeof meta>

// one thumb at the top of its range
export const OneThumb: Story = {}

// two thumbs that pick a range
export const Range: Story = { args: { defaultValue: [5, 20], "aria-label": "Range" } }

// a disabled slider, dimmed and ignoring drags
export const Disabled: Story = { args: { disabled: true } }
