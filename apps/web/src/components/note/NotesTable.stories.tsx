import { TEST_NOTES } from "@carlnotes/contracts/noteTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { NotesTable } from "./NotesTable"

// the same rows exercise visibility, totals, sorting, and page-size changes on both platforms
const meta: Meta<typeof NotesTable> = {
	title: "Note/NotesTable",
	component: NotesTable,
	parameters: { surface: "card", webReference: "apps/web/src/components/note/NotesTable.tsx at 375px" },
	args: { notes: TEST_NOTES, onOpenNote: () => undefined },
}
export default meta
type Story = StoryObj<typeof meta>
export const Paginated: Story = {}
export const OnePage: Story = { args: { notes: TEST_NOTES.slice(0, 3) } }
export const Empty: Story = { args: { notes: [] } }
