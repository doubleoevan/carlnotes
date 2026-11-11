// the mobile topic image link, with the web stories' names
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicImageLink } from "./TopicImageLink"

// the podcast cover placeholder shows in place of a topic's image, which the api serves from its public files
const SAMPLE_FILES = { url: "/podcast-cover-placeholder.jpg", url2x: "/podcast-cover-placeholder.jpg" }

const meta = {
	title: "Topic/TopicImageLink",
	component: TopicImageLink,
	parameters: { webReference: "apps/web/src/components/topic/TopicImageLink.stories.tsx at 375px" },
	args: {
		image: { page: SAMPLE_FILES, list: SAMPLE_FILES, thumbnail: SAMPLE_FILES },
		size: "list",
		name: "Home espresso",
		path: "/topics/topic-home-espresso/home-espresso",
	},
} satisfies Meta<typeof TopicImageLink>

export default meta
type Story = StoryObj<typeof meta>

// beside a title that opens the same screen, the link is no accessibility element of its own
export const BesideTitle: Story = {}

// a row's thumbnail, linked the same way
export const Thumbnail: Story = { args: { size: "thumbnail" } }

// the only link to the screen has its name
export const OnlyLink: Story = { args: { size: "page", className: "w-80", label: "Open Home espresso" } }

// on the image's own screen it is a plain image. the component browser's own route is the screen that is open
export const OwnPage: Story = { args: { path: "/storybook" } }
