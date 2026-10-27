import type { Meta, StoryObj } from "@storybook/react-native"
import { HostAvatar } from "./HostAvatar"

// the component fixture and preview layout
const meta: Meta<typeof HostAvatar> = {
	title: "Branding/HostAvatar",
	component: HostAvatar,
	args: { speaker: "host" },
	parameters: { webReference: "apps/web/src/components/branding/HostAvatar.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Carl: Story = {}
export const Vienna: Story = { args: { speaker: "cohost" } }
