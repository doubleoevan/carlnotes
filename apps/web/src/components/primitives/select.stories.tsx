// the select primitive: a trigger showing the chosen value and the list of options it opens
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import type * as React from "react"
import { fn } from "storybook/test"
import { NoteVisibilitySelect } from "@/components/note/NoteVisibilitySelect"
import { FrequencyOption } from "@/components/topic/EditTopicFields"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"

// the root's props, and the trigger's height
type SelectStoryArgs = React.ComponentProps<typeof Select> & Pick<React.ComponentProps<typeof SelectTrigger>, "size">

// the scan frequencies the topic editor offers, in its order
const FREQUENCY_OPTIONS = [
	{ value: "weekly", label: "Weekly" },
	{ value: "weekdays", label: "Weekdays" },
	{ value: "daily", label: "Daily" },
]

// aria-hidden-focus: while the list is open, radix aria-hides everything outside it and keeps focus inside the list, so
// the hidden trigger cannot take focus. the rule is off for the open list stories alone
const OPEN_LIST_PARAMETERS = { a11y: { config: { rules: [{ id: "aria-hidden-focus", enabled: false }] } } }

const meta = {
	title: "Primitives/Select",
	component: Select,
	args: { defaultValue: "weekly", defaultOpen: false, disabled: false, size: "default", onValueChange: fn() },
	argTypes: {
		defaultValue: {
			control: "inline-radio",
			options: FREQUENCY_OPTIONS.map((frequencyOption) => frequencyOption.value),
		},
		defaultOpen: { control: "boolean" },
		disabled: { control: "boolean" },
		size: { control: "inline-radio", options: ["default", "sm"] },
		onValueChange: { control: false },
		children: { control: false },
	},
	parameters: {
		// the trigger sits in the middle, so the open list has room below it
		layout: "centered",
		// the app's selects sit in the topic editor and note dialogs, on the card fill
		surface: "card",
		// an open list floats over the page, so each story on the docs page gets its own frame
		docs: toOwnFrameDocs(280),
	},
	// the frequency select, as the topic editor builds it
	render: (args) => <FrequencySelect {...args} />,
} satisfies Meta<SelectStoryArgs>

export default meta
type Story = StoryObj<typeof meta>

// the closed trigger showing the chosen value
export const Closed: Story = {}

// the open list, with a check beside the chosen value
export const Open: Story = {
	args: { defaultOpen: true },
	parameters: OPEN_LIST_PARAMETERS,
}

// the note visibility select: the shorter trigger, sized to its value, with an icon beside each visibility
export const Small: Story = {
	parameters: { controls: { disable: true } },
	render: () => (
		<NoteVisibilitySelect
			visibilities={["private", "team", "public"]}
			visibility="team"
			onNoteVisibilityChange={fn()}
		/>
	),
}

// a disabled trigger, dimmed and ignoring clicks. the primitive draws it, though no app select is ever disabled
export const Disabled: Story = { args: { disabled: true } }

// no value yet, so the trigger shows a placeholder. the primitive draws it, though every app select has a value
export const Placeholder: Story = {
	args: { defaultValue: undefined },
	render: (args) => <FrequencySelect {...args} placeholder="Pick one" />,
}

// the topic editor's open list once the plan's daily topics are used, each daily frequency dimmed with a coffee cup
// and a tooltip. the value stays put, so a pick of a daily frequency only calls onValueChange, where the topic editor
// opens the plans page instead
export const DisabledDailyFrequencies: Story = {
	args: { defaultOpen: true },
	parameters: OPEN_LIST_PARAMETERS,
	render: ({ defaultValue, ...args }) => (
		<FrequencySelect {...args} value={defaultValue}>
			<FrequencyOption frequency="weekly" hasDailySlot={false} />
			<FrequencyOption frequency="weekdays" hasDailySlot={false} />
			<FrequencyOption frequency="daily" hasDailySlot={false} />
		</FrequencySelect>
	),
}

// the frequency select's trigger and list, with every frequency open unless given its own options
function FrequencySelect({ size, placeholder, children, ...selectProps }: SelectStoryArgs & { placeholder?: string }) {
	return (
		<Select {...selectProps}>
			<SelectTrigger size={size} className="w-32" aria-label="Frequency">
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{children ??
					FREQUENCY_OPTIONS.map((frequencyOption) => (
						<SelectItem key={frequencyOption.value} value={frequencyOption.value}>
							{frequencyOption.label}
						</SelectItem>
					))}
			</SelectContent>
		</Select>
	)
}
