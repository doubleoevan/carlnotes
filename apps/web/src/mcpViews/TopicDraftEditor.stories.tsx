import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { useEffect, useState } from "react"
import { setMcpViewData } from "./mcpViewHost"
import { TopicDraftEditor } from "./TopicDraftEditor"

const meta = {
	title: "MCP Apps/MCP views/TopicDraftEditor",
	component: TopicDraftEditor,
	args: {
		topicDraft: {
			...EMPTY_TOPIC_DRAFT,
			name: "Moss terrarium",
			prompt: "Compare humidity sensors and ventilation",
			visibility: "private",
			sources: [{ sourceOption: "url", value: "https://en.wikipedia.org/wiki/Terrarium" }],
		},
		isDisabled: false,
		onChange: () => undefined,
		isPrivateSendDestination: true,
	},
	render: function EditableDraft(args) {
		const [draft, setDraft] = useState(args.topicDraft)
		useEffect(() => {
			setMcpViewData({
				[MCP_VIEW_META_KEY]: {
					session: null,
					podcastEpisodes: [],
					topicDraftOptions: { knownTags: ["terrarium", "humidity", "plants"], isPodcastEnabledByDefault: true },
				},
			})
			return () => setMcpViewData(undefined)
		}, [])
		return <TopicDraftEditor {...args} topicDraft={draft} onChange={setDraft} />
	},
} satisfies Meta<typeof TopicDraftEditor>
export default meta
type Story = StoryObj<typeof meta>
export const WithChatLinks: Story = {}
export const Saving: Story = { args: { isDisabled: true } }
export const EmptyFields: Story = { args: { topicDraft: { ...EMPTY_TOPIC_DRAFT, visibility: "private" } } }
export const SourceLimit: Story = {
	args: {
		topicDraft: {
			...meta.args.topicDraft,
			sources: Array.from({ length: 10 }, (_, index) => ({
				sourceOption: "url",
				value: `https://example.com/${index}`,
			})),
		},
	},
}
