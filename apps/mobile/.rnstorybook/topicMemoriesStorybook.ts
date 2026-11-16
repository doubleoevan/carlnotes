// a direct Journal test link prepares its native stories without opening the full story catalog
import { type InitialSelection, start } from "@storybook/react-native"
import * as topicMemoriesStories from "@/components/topic/TopicMemoriesDialog.stories"
import * as preview from "./preview"

const topicMemoriesFiles = Object.assign(() => topicMemoriesStories, {
	keys: () => ["./TopicMemoriesDialog.stories.tsx"],
})

export function createTopicMemoriesStorybook(
	storyId: InitialSelection,
): ReturnType<ReturnType<typeof start>["getStorybookUI"]> {
	return start({
		annotations: [preview],
		storyEntries: [
			{
				directory: "../src/components/topic",
				files: "TopicMemoriesDialog.stories.tsx",
				importPathMatcher: /TopicMemoriesDialog\.stories\.tsx$/,
				titlePrefix: "",
				req: topicMemoriesFiles,
			},
		],
	}).getStorybookUI({ initialSelection: storyId, onDeviceUI: false, shouldPersistSelection: false })
}
