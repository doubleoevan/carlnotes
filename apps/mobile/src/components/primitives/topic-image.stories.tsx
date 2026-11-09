// the mobile TopicImage: each size's box, with the web stories' names. the ground shows in every story, since a
// story has no api to load a file from
import { topicImageSizes } from "@carlnotes/contracts/enums"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicImage } from "./topic-image"

const meta = {
	title: "Primitives/TopicImage",
	component: TopicImage,
	parameters: { webReference: "apps/web/src/components/primitives/topic-image.stories.tsx" },
	args: { image: null, size: "page", name: "Home espresso" },
	argTypes: { size: { control: "inline-radio", options: topicImageSizes } },
	render: (args) => (
		<View className="w-80">
			<TopicImage {...args} />
		</View>
	),
} satisfies Meta<typeof TopicImage>

export default meta
type Story = StoryObj<typeof meta>

// the page size, which fills its column at 3:2 on a card and the topic screen header
export const Page: Story = {}

// the list size, beside a Topics tab row
export const List: Story = { args: { size: "list" } }

// the thumbnail, beside a search result
export const Thumbnail: Story = { args: { size: "thumbnail" } }

// a topic whose render has not landed shows the muted ground at the size's box
export const NoImage: Story = { args: { image: null } }
