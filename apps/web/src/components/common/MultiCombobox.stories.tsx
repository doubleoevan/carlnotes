// the multi-select combobox: the picked options as removable pills over a filterable dropdown list
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, screen } from "storybook/test"
import { NEW_TEAM_OPTION } from "@/lib/topicTeamChoices"
import { findVisibleByText } from "../../../.storybook/play"
import { useSyncedArg } from "../../../.storybook/useSyncedArg"
import { type ComboboxOption, MultiCombobox } from "./MultiCombobox"

// the topics a user can add to a team
const TOPIC_OPTIONS: ComboboxOption[] = [
	{ value: "topic-llm-tooling", label: "LLM tooling" },
	{ value: "topic-rust", label: "Rust in production" },
	{ value: "topic-design-systems", label: "Design systems" },
	{ value: "topic-coffee", label: "Specialty coffee" },
	{ value: "topic-climate", label: "Climate tech" },
	{ value: "topic-podcasting", label: "Independent podcasting" },
]

// the teams a user can share a topic with
const TEAM_OPTIONS: ComboboxOption[] = [
	{ value: "team-reading-club", label: "Reading Club" },
	{ value: "team-platform", label: "Platform team" },
]

const meta = {
	title: "Common/MultiCombobox",
	component: MultiCombobox,
	args: {
		options: TOPIC_OPTIONS,
		values: [],
		onUpdateValues: fn(),
		placeholder: "pick topics…",
		emptyLabel: "No topics to add yet.",
	},
	argTypes: {
		options: { control: "object" },
		values: { control: "object" },
		placeholder: { control: "text" },
		emptyLabel: { control: "text" },
		newOptionLabel: { control: "text" },
		pinnedOption: { control: "object" },
		onUpdateValues: { control: false },
		onNewOption: { control: false },
	},
	// the topic and team dialogs the field sits in
	parameters: { surface: "card" },
	// the field's width in a modal
	decorators: [
		(Story) => (
			<div style={{ width: 320 }}>
				<Story />
			</div>
		),
	],
	render: function RenderMultiCombobox(args) {
		// record the click, then keep the picked values in the args so the pills and the controls update
		const handleUpdateValues = useSyncedArg<typeof args, "values">("values", args.onUpdateValues)
		return <MultiCombobox {...args} onUpdateValues={handleUpdateValues} />
	},
} satisfies Meta<typeof MultiCombobox>

export default meta
type Story = StoryObj<typeof meta>

// nothing picked, with the list closed
export const Default: Story = {}

// no topics to offer at all, so the open list shows the empty label
export const Empty: Story = {
	args: { options: [] },
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /pick topics/ }))
		await findVisibleByText("No topics to add yet.")
	},
}

// two topics picked, each a removable pill
export const Picked: Story = { args: { values: ["topic-llm-tooling", "topic-coffee"] } }

// the list open, with the picked topic highlighted and checked
export const Open: Story = {
	args: { values: ["topic-rust"] },
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /1 selected/ }))
	},
}

// a filter that matches none of the topics on offer, which says nothing matches instead of showing the empty label
export const NoMatches: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /pick topics/ }))
		await userEvent.type(await screen.findByLabelText("Filter the list"), "quantum")
		await findVisibleByText("Nothing matches.")
	},
}

// the new-option row under the list, which opens a new topic instead of picking one
export const WithNewOption: Story = {
	args: { newOptionLabel: "New topic", onNewOption: fn() },
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /pick topics/ }))
	},
}

// a pinned option under the list, which a long list never hides and which picks like any other row
export const WithPinnedOption: Story = {
	args: {
		options: TEAM_OPTIONS,
		values: [NEW_TEAM_OPTION.value],
		pinnedOption: NEW_TEAM_OPTION,
		placeholder: "Pick teams…",
		emptyLabel: "No teams to pick.",
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /1 selected/ }))
	},
}
