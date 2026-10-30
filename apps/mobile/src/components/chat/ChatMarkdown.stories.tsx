import { CHAT_STORY_MARKDOWN } from "@carlnotes/core/lib/chatStoryFixtures"
import { NEW_TOPIC_CHAT_WORDS } from "@carlnotes/core/lib/safeChatMarkdown"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useEffect, useState } from "react"
import { ScrollView } from "react-native"
import { ChatMarkdown } from "./ChatMarkdown"

// the component fixture and preview layout
const meta: Meta<typeof ChatMarkdown> = {
	title: "Chat/ChatMarkdown",
	component: ChatMarkdown,
	args: { markdown: CHAT_STORY_MARKDOWN },
	parameters: { webReference: "apps/web/src/components/chat/ChatMarkdown.tsx", surface: "card" },
	decorators: [
		(Story) => (
			<ScrollView style={{ width: "100%" }}>
				<Story />
			</ScrollView>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const TableAndLinks: Story = {}
export const Streaming: Story = { render: () => <StreamingAnswer /> }
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
// the invitation renders as a link that opens the new-topic chat
export const NewTopicInvitation: Story = { args: { markdown: NEW_TOPIC_CHAT_WORDS } }

// append real chunks to exercise the native renderer's streaming path
function StreamingAnswer() {
	const [visibleCharacterCount, setVisibleCharacterCount] = useState(20)
	useEffect(() => {
		const streamTimer = setInterval(
			() => setVisibleCharacterCount((characterCount) => Math.min(CHAT_STORY_MARKDOWN.length, characterCount + 5)),
			100,
		)
		return () => clearInterval(streamTimer)
	}, [])
	return (
		<ChatMarkdown
			markdown={CHAT_STORY_MARKDOWN.slice(0, visibleCharacterCount)}
			isStreaming={visibleCharacterCount < CHAT_STORY_MARKDOWN.length}
		/>
	)
}
