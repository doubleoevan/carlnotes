import { TopicPersonalSourcesSectionStory } from "@carlnotes/core/components/TopicPersonalSourcesSectionStory"
import type { Meta, StoryObj } from "@storybook/react-native"
import type { ComponentProps } from "react"
import { ScrollView } from "react-native"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"

// mirror apps/web/src/components/topic/TopicPersonalSourcesSection.stories.tsx at 375px through the same body
const meta = {
	title: "Topic/TopicPersonalSourcesSection",
	component: PersonalSourcesStory,
	parameters: { webReference: "apps/web/src/components/topic/TopicPersonalSourcesSection.stories.tsx at 375px" },
} satisfies Meta<typeof PersonalSourcesStory>
export default meta
type Story = StoryObj<typeof meta>
export const Collapsed: Story = { args: { initialOpen: false } }
export const Ready: Story = { args: {} }
export const WithItems: Story = { args: {} }
export const EntryExpanded: Story = { args: { isEntryExpanded: true } }
export const SharedComments: Story = { args: { hasSharedComments: true } }
// show each conversation destination through the production link adapter
export const ConversationPlatforms: Story = { args: { isPlatformGallery: true } }
export const Codex: Story = { args: { isEntryExpanded: true, conversationExample: "codex" } }
export const GeminiShared: Story = { args: { isEntryExpanded: true, conversationExample: "geminiShared" } }
export const CursorShared: Story = { args: { isEntryExpanded: true, conversationExample: "cursorShared" } }
export const Microsoft365Copilot: Story = { args: { isEntryExpanded: true, conversationExample: "copilotWork" } }
export const Claude: Story = { args: { isEntryExpanded: true, conversationExample: "claude" } }
export const ClaudeCode: Story = { args: { isEntryExpanded: true, conversationExample: "claudeCode" } }
export const ChatGPT: Story = { args: { isEntryExpanded: true, conversationExample: "chatgpt" } }
export const Gemini: Story = { args: { isEntryExpanded: true, conversationExample: "gemini" } }
export const Grok: Story = { args: { isEntryExpanded: true, conversationExample: "grok" } }
export const Perplexity: Story = { args: { isEntryExpanded: true, conversationExample: "perplexity" } }
export const DeepSeek: Story = { args: { isEntryExpanded: true, conversationExample: "deepseek" } }
export const Cursor: Story = { args: { isEntryExpanded: true, conversationExample: "cursor" } }
export const MicrosoftCopilot: Story = { args: { isEntryExpanded: true, conversationExample: "copilot" } }
export const OtherPlatform: Story = { args: { isEntryExpanded: true, conversationExample: "other" } }
export const WithoutConversationUrl: Story = { args: { isEntryExpanded: true, conversationExample: "vscode" } }

export const Paginated: Story = { args: { variant: "paged" } }
export const Page2: Story = { args: { variant: "page2" } }
export const Empty: Story = { args: { variant: "empty" } }
export const Loading: Story = { args: { variant: "loading" } }
export const Failed: Story = { args: { variant: "failed" } }
export const LongText: Story = { args: { variant: "long" } }
export const FormerEditor: Story = { args: { canContribute: false } }
export const FormerEditorEmpty: Story = { args: { variant: "empty", canContribute: false } }

// use shared fixture state with this platform's Nightshift controls
function PersonalSourcesStory(props: Omit<ComponentProps<typeof TopicPersonalSourcesSectionStory>, "elements">) {
	return (
		<ScrollView className="w-full" contentContainerClassName="min-w-0">
			<TopicPersonalSourcesSectionStory {...props} elements={PERSONAL_SOURCES_ELEMENTS} />
		</ScrollView>
	)
}
