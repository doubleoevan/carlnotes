import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { LinkPreviewLoading } from "./LinkPreviewLoading"

// the loading note on a card surface
const meta = {
	title: "Common/LinkPreviewLoading",
	component: LinkPreviewLoading,
	parameters: { surface: "card" },
} satisfies Meta<typeof LinkPreviewLoading>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
