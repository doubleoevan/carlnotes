import type { Meta, StoryObj } from "@storybook/react-native"
import { UserMenu } from "./UserMenu"

// the native counterpart of the web component
const meta = {
	title: "Layout/UserMenu",
	component: UserMenu,
	parameters: { webReference: "apps/web/src/components/layout/UserMenu.tsx at 375px" },
	args: {},
} satisfies Meta<typeof UserMenu>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
