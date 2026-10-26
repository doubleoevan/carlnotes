import type { Meta, StoryObj } from "@storybook/react-native"
import { CoffeeLoading } from "./CoffeeLoading"

// loading labels share the web's display font at the size of their surrounding content
const meta = {
	title: "Branding/CoffeeLoading",
	component: CoffeeLoading,
	parameters: { webReference: "apps/web/src/components/branding/CoffeeLoading.tsx" },
} satisfies Meta<typeof CoffeeLoading>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Topics: Story = { args: { label: "Loading your topics" } }
export const Small: Story = { args: { isSmall: true } }
