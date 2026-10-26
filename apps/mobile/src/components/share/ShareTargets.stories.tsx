import type { Meta, StoryObj } from "@storybook/react-native"
import { ShareTargets } from "./ShareTargets"

// the native counterpart of the web component
const meta = {
	title: "Share/ShareTargets",
	component: ShareTargets,
	parameters: { webReference: "apps/web/src/components/share/ShareOptions.tsx at 375px" },
	args: { topic: { name: "Coffee" }, topicUrl: "https://carlnotes.com/topics/coffee", kind: "post", isEnabled: true },
} satisfies Meta<typeof ShareTargets>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
