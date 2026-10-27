import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import type { Meta, StoryObj } from "@storybook/react-native"
import { AddToAiDialog } from "./AddToAiDialog"

// use the production connector URL in a non-mutating copy/instructions preview
const meta = {
	title: "Common/AddToAiDialog",
	component: AddToAiDialog,
	args: { mcpServer: { name: "CarlNotes", url: `${SITE_URL}/mcp` }, onClose: () => undefined },
	parameters: { webReference: "apps/web/src/components/common/AddToAiDialog.tsx at 375px" },
} satisfies Meta<typeof AddToAiDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
