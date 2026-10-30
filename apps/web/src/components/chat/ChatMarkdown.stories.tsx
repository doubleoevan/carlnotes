import { CHAT_STORY_MARKDOWN } from "@carlnotes/core/lib/chatStoryFixtures"
import { NEW_TOPIC_CHAT_WORDS } from "@carlnotes/core/lib/safeChatMarkdown"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { useEffect, useState } from "react"
import { ChatMarkdown } from "./ChatMarkdown"

// the browser Markdown fixture and layout
const meta: Meta<typeof ChatMarkdown> = {
	title: "Chat/ChatMarkdown",
	component: ChatMarkdown,
	args: { markdown: CHAT_STORY_MARKDOWN },
	parameters: { surface: "card" },
	decorators: [
		(Story) => (
			<div className="w-full max-w-lg">
				<Story />
			</div>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
// finished, streaming, and unsafe-content states
export const TableAndLinks: Story = {}
// the story reveals its text over several seconds, so it takes no screenshot. TableAndLinks shows the same markdown
// complete
export const Streaming: Story = { tags: ["no-screenshot"], render: () => <StreamingAnswer /> }
export const LiteralHtml: Story = {
	args: {
		markdown:
			'<b>Raw HTML</b> <script>alert(1)</script> <img src="https://example.com/pixel">\n\n&lt;iframe&gt; **Safe bold**',
	},
}
export const RejectedLinks: Story = {
	args: {
		markdown:
			"[Script](javascript:alert(1)) [Data](data:text/html,hi) [File](file:///tmp/test) [Email](mailto:hello@example.com) [Website](https://example.com)\n\n`<b>code</b>`\n\n![Image name](https://example.com/image.png)",
	},
}
export const NewTopicInvitation: Story = { args: { markdown: NEW_TOPIC_CHAT_WORDS } }

// append answer chunks to exercise the browser streaming renderer
function StreamingAnswer() {
	// reveal answer text in timed chunks
	const [markdownLength, setMarkdownLength] = useState(20)
	useEffect(() => {
		const streamingInterval = setInterval(
			() =>
				setMarkdownLength((previousMarkdownLength) => Math.min(CHAT_STORY_MARKDOWN.length, previousMarkdownLength + 5)),
			100,
		)
		return () => clearInterval(streamingInterval)
	}, [])
	return <ChatMarkdown markdown={CHAT_STORY_MARKDOWN.slice(0, markdownLength)} />
}
