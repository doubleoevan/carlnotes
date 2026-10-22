// the global footer: the copyright line, the site links, and the legal links
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"
import { Footer } from "./Footer"

const meta = {
	title: "Layout/Footer",
	component: Footer,
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Footer>

export default meta
type Story = StoryObj<typeof meta>

// the footer on any page
export const Default: Story = {}

// the footer on the releases page, which underlines its own link
export const OnReleases: Story = { parameters: { tanstack: { router: { route: { path: "/releases" } } } } }

// the footer on a 375-pixel-wide phone, where both link rows wrap
export const Phone: Story = {
	// the docs page is wider than a phone, so the story stays off it
	tags: ["!autodocs"],
	globals: PHONE_VIEWPORT_GLOBALS,
}
