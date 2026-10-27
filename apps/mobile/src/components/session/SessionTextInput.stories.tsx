import type { Meta, StoryObj } from "@storybook/react-native"
import { SessionTextInput } from "./SessionTextInput"

// preserve the shared field border and fill when a form customizes its size
const meta = {
	title: "Session/SessionTextInput",
	component: SessionTextInput,
	args: { label: "Title" },
} satisfies Meta<typeof SessionTextInput>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Multiline: Story = { args: { label: "Description", multiline: true, className: "min-h-24" } }
export const ReportReason: Story = {
	args: { label: "Why you are reporting this", isLabelVisible: false, multiline: true, className: "min-h-24" },
}
