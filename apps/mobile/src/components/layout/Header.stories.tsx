import type { Meta, StoryObj } from "@storybook/react-native"
import { Header } from "./Header"

// the compact signed-in header, checked against the web's phone story
const meta = {
	title: "Layout/Header",
	component: Header,
	parameters: { webReference: "layout-header--user at 375px" },
	args: { onReheat: () => undefined },
} satisfies Meta<typeof Header>
export default meta
type Story = StoryObj<typeof meta>
export const Home: Story = { args: { isHome: true } }
// a visitor's Home brand row, without the tutorial button the hero below it holds
export const VisitorHome: Story = { args: { isHome: true, isHeroShown: true } }
export const Reheating: Story = { args: { isHome: true, isReheating: true } }
export const Topic: Story = {}
export const Settings: Story = {}
