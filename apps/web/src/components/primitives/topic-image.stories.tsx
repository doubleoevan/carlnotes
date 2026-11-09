// the topic image primitive: each size with a file, and the ground a topic with no image shows
import { topicImageSizes } from "@carlnotes/contracts/enums"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TopicImage } from "./topic-image"

// the podcast cover placeholder stands in for a topic's image at every size, which the app serves from its public files
const SAMPLE_FILES = { url: "/podcast-cover-placeholder.jpg", url2x: "/podcast-cover-placeholder.jpg" }
const SAMPLE_IMAGE = { page: SAMPLE_FILES, list: SAMPLE_FILES, thumbnail: SAMPLE_FILES }

const meta = {
	title: "Primitives/TopicImage",
	component: TopicImage,
	args: { image: SAMPLE_IMAGE, size: "page", name: "Home espresso" },
	argTypes: { size: { control: "inline-radio", options: topicImageSizes } },
	decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof TopicImage>

export default meta
type Story = StoryObj<typeof meta>

// the page size, which fills its column at 3:2 on a card and the topic page header
export const Page: Story = {}

// the list size, beside a Topics page row
export const List: Story = { args: { size: "list" } }

// the thumbnail, beside a search result
export const Thumbnail: Story = { args: { size: "thumbnail" } }

// a topic whose render has not landed shows the muted ground at the size's box
export const NoImage: Story = { args: { image: null } }
