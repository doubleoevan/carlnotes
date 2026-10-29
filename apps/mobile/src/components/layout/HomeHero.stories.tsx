import type { Meta, StoryObj } from "@storybook/react-native"
import { HomeHero } from "./HomeHero"

// a visitor's Home hero, to check against the web's phone hero at 375px
const meta = {
	title: "Layout/HomeHero",
	component: HomeHero,
	parameters: { webReference: "apps/web/src/components/layout/HomeHero.tsx at 375px" },
} satisfies Meta<typeof HomeHero>
export default meta
type Story = StoryObj<typeof meta>
export const Visitor: Story = {}
