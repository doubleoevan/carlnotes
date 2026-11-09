// a visitor's home headline, which a light wipes across once, on the page background under the search bar
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { HomeHeadline } from "./HomeHeadline"

const meta = {
	title: "Layout/HomeHeadline",
	component: HomeHeadline,
	parameters: { tanstack: { router: { route: { path: "/" } } } },
} satisfies Meta<typeof HomeHeadline>

export default meta
type Story = StoryObj<typeof meta>

// the headline with "All of it." in the link color
export const Default: Story = {}
