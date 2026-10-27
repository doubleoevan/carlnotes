import type { NoteVisibility } from "@carlnotes/contracts/notes"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { NoteVisibilitySelect } from "@/components/note/NoteVisibilitySelect"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"

// the web select's states, with native anchoring and option targets
const meta: Meta<typeof Select> = {
	title: "Primitives/Select",
	component: Select,
	parameters: { webReference: "primitives-select--closed" },
	render: function Example(args) {
		// hold the selected option while the menu opens and closes
		const [value, setValue] = useState<{ value: string; label: string } | undefined>({ value: "10", label: "10" })
		const insets = useSafeAreaInsets()
		return (
			<Select {...args} value={value} onValueChange={setValue}>
				<SelectTrigger accessibilityLabel="Rows per page">
					<SelectValue placeholder="Rows" />
				</SelectTrigger>
				<SelectContent insets={insets}>
					{[5, 10, 25, 50].map((size) => (
						<SelectItem key={size} value={String(size)} label={String(size)} />
					))}
				</SelectContent>
			</Select>
		)
	},
}
export default meta
type Story = StoryObj<typeof meta>
export const Closed: Story = {}
export const Disabled: Story = { args: { disabled: true } }

// match the web's icon-bearing visibility options with native selection and touch targets
export const Small: Story = {
	render: function VisibilityExample() {
		const [visibility, setVisibility] = useState<NoteVisibility>("team")
		return (
			<NoteVisibilitySelect
				visibilities={["private", "team", "public"]}
				visibility={visibility}
				onNoteVisibilityChange={setVisibility}
			/>
		)
	},
}
