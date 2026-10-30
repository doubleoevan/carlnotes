// a visitor's home page hero: the headline with the video's button, Carl's image, the call to action with his pitch
// behind its note button, and the tagline, on the header's hero background
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"
import { HomeHero } from "./HomeHero"

const meta = {
	title: "Layout/HomeHero",
	component: HomeHero,
	// the header draws the hero background and text color, so the story draws them around the hero
	render: (args) => (
		<div className="bg-hero text-hero-foreground px-4 pb-6">
			<HomeHero {...args} />
		</div>
	),
	args: { pathname: "/", onHomeClick: () => undefined, onPlayTopicTutorialVideo: () => undefined },
	parameters: { layout: "fullscreen", tanstack: { router: { route: { path: "/" } } } },
} satisfies Meta<typeof HomeHero>

export default meta
type Story = StoryObj<typeof meta>

// the hero on a wide screen: Carl beside the headline, the copy to his right
export const Visitor: Story = {}

// the hero on a 375-pixel-wide phone, the mobile app's reference: the headline spans above Carl
export const VisitorPhone: Story = {
	// the docs page is wider than a phone, so the story stays off it
	tags: ["!autodocs"],
	globals: PHONE_VIEWPORT_GLOBALS,
}
