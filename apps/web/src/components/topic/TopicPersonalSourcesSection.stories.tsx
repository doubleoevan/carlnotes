import type { ExpandableRowProps } from "@carlnotes/core/components/ExpandableRow"
import { TopicPersonalSourcesSectionStory } from "@carlnotes/core/components/TopicPersonalSourcesSectionStory"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import type { ComponentProps } from "react"
import { ExpandableRow } from "@/components/primitives/expandable-row"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"

// use the production presentation and shared content with fictional, local state
const meta = { title: "Topic/TopicPersonalSourcesSection", component: PersonalSourcesStory } satisfies Meta<
	typeof PersonalSourcesStory
>
export default meta
type Story = StoryObj<typeof meta>
export const Collapsed: Story = { args: { initialOpen: false } }
export const Ready: Story = { args: {} }
export const WithItems: Story = { args: {} }
export const ItemExpanded: Story = { args: { isItemExpanded: true } }
// show each conversation destination through the production link adapter
export const ConversationPlatforms: Story = { args: { isPlatformGallery: true } }
export const Codex: Story = { args: { isItemExpanded: true, conversationExample: "codex" } }
export const GeminiShared: Story = { args: { isItemExpanded: true, conversationExample: "geminiShared" } }
export const CursorShared: Story = { args: { isItemExpanded: true, conversationExample: "cursorShared" } }
export const Microsoft365Copilot: Story = { args: { isItemExpanded: true, conversationExample: "copilotWork" } }
export const Claude: Story = { args: { isItemExpanded: true, conversationExample: "claude" } }
export const ClaudeCode: Story = { args: { isItemExpanded: true, conversationExample: "claudeCode" } }
export const ChatGPT: Story = { args: { isItemExpanded: true, conversationExample: "chatgpt" } }
export const Gemini: Story = { args: { isItemExpanded: true, conversationExample: "gemini" } }
export const Grok: Story = { args: { isItemExpanded: true, conversationExample: "grok" } }
export const Perplexity: Story = { args: { isItemExpanded: true, conversationExample: "perplexity" } }
export const DeepSeek: Story = { args: { isItemExpanded: true, conversationExample: "deepseek" } }
export const Cursor: Story = { args: { isItemExpanded: true, conversationExample: "cursor" } }
export const MicrosoftCopilot: Story = { args: { isItemExpanded: true, conversationExample: "copilot" } }
export const OtherPlatform: Story = { args: { isItemExpanded: true, conversationExample: "other" } }
export const WithoutConversationUrl: Story = { args: { isItemExpanded: true, conversationExample: "vscode" } }

export const Paginated: Story = { args: { variant: "paged" } }
export const Page2: Story = { args: { variant: "page2" } }
export const Empty: Story = { args: { variant: "empty" } }
export const Loading: Story = { args: { variant: "loading" } }
export const Failed: Story = { args: { variant: "failed" } }
export const LongText: Story = { args: { variant: "long" } }
export const FormerEditor: Story = { args: { canContribute: false } }
export const FormerEditorEmpty: Story = { args: { variant: "empty", canContribute: false } }

// use shared fixture state with this platform's Nightshift controls
function PersonalSourcesStory(
	props: Omit<ComponentProps<typeof TopicPersonalSourcesSectionStory>, "elements" | "expandedElements">,
) {
	return (
		<TopicPersonalSourcesSectionStory
			{...props}
			elements={PERSONAL_SOURCES_ELEMENTS}
			expandedElements={EXPANDED_ELEMENTS}
		/>
	)
}

// keep the story adapter stable while the shared row owns disclosure state
function ExpandedRow(props: ExpandableRowProps) {
	return <ExpandableRow {...props} initialOpen />
}
const EXPANDED_ELEMENTS = { ...PERSONAL_SOURCES_ELEMENTS, ExpandableRow: ExpandedRow }
