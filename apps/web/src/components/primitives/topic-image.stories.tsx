// the topic image primitive: each size with a file, and the coffee mug each size shows for a topic with no image
import { topicImageSizes } from "@carlnotes/contracts/enums"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { SAMPLE_TOPIC_IMAGE } from "../../../.storybook/fixtures/topics"
import { TopicImage } from "./topic-image"

const meta = {
	title: "Primitives/TopicImage",
	component: TopicImage,
	args: { image: SAMPLE_TOPIC_IMAGE, size: "page", name: "Home espresso" },
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

// a topic with no image to show draws the coffee mug on the muted background at the size's box
export const NoImage: Story = { args: { image: null } }

// the coffee mug at the list size
export const NoImageList: Story = { args: { image: null, size: "list" } }

// the coffee mug at the thumbnail size
export const NoImageThumbnail: Story = { args: { image: null, size: "thumbnail" } }
