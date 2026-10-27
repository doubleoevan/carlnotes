import type { Meta, StoryObj } from "@storybook/react-native"
import { Footer } from "./Footer"

// exercise the real shared footer with both Nightshift palettes and native text scaling
const meta = {
	title: "Layout/Footer",
	component: Footer,
	parameters: { webReference: "apps/web/src/components/layout/Footer.tsx at 375px" },
} satisfies Meta<typeof Footer>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Phone: Story = {}
