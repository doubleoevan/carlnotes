import type { Meta, StoryObj } from "@storybook/react-native"
import { Avatar } from "./Avatar"

// use the web's shared identity artwork in both palettes
const meta = {
	title: "Branding/Avatar",
	component: Avatar,
	parameters: { webReference: "apps/web/src/components/branding/Avatar.tsx" },
	args: { imageUrl: null, ownerId: "coffee", name: "Coffee Readers" },
} satisfies Meta<typeof Avatar>
export default meta
type Story = StoryObj<typeof meta>
export const Initials: Story = {}
export const Account: Story = { args: { size: 44 } }
