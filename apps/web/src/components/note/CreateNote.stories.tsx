import { createNote } from "@carlnotes/client/noteClient"
import { toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { Dialog, DialogContent } from "@/components/primitives/dialog"
import { CreateNote } from "./CreateNote"

// keep the live form inside its real accessible dialog with isolated requests
const meta = {
	title: "Note/CreateNote",
	component: CreateNote,
	args: {
		page: { pageType: "topic", pageId: "story-topic" },
		creatableVisibilities: ["private", "team", "public"],
		onCreated: fn(),
	},
	beforeEach: () => {
		mocked(createNote).mockResolvedValue(toTestNote())
	},
	render: (args) => (
		<Dialog open>
			<DialogContent>
				<CreateNote {...args} />
			</DialogContent>
		</Dialog>
	),
} satisfies Meta<typeof CreateNote>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const PrivateOnly: Story = { args: { creatableVisibilities: ["private"] } }
export const Failed: Story = {
	beforeEach: () => {
		mocked(createNote).mockResolvedValue(null)
	},
}
export const Offline: Story = { args: { isDisabled: true } }
