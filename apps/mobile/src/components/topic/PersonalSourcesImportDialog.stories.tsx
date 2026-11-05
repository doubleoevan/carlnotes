import type { Meta, StoryObj } from "@storybook/react-native"
import { fn } from "storybook/test"
import { PersonalSourcesImportDialog } from "./PersonalSourcesImportDialog"

// native presents the same import guidance while browser file APIs remain on web
const meta = {
	title: "Topic/PersonalSourcesImportDialog",
	component: PersonalSourcesImportDialog,
	parameters: { webReference: "apps/web/src/components/topic/PersonalSourcesImportDialog.stories.tsx at 375px" },
	args: { topicId: "topic-example", onClose: fn(), onImported: fn(async () => {}) },
} satisfies Meta<typeof PersonalSourcesImportDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Empty: Story = {}
