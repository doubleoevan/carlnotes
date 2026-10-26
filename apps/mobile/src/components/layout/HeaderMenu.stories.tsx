import type { Meta, StoryObj } from "@storybook/react-native"
import { HeaderMenu } from "./HeaderMenu"

// the native counterpart of the web component
const meta = {
	title: "Layout/HeaderMenu",
	component: HeaderMenu,
	parameters: { webReference: "apps/web/src/components/layout/HeaderMenu.tsx at 375px" },
	args: {},
} satisfies Meta<typeof HeaderMenu>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
