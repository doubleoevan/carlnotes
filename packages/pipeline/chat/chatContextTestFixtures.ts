// the chat context and the prompt text that the chat prompt tests share
import type { ChatContext } from "./retrieve"

// the spoken fragment's opening line
export const SPOKEN_BLOCK_START = "The reader said this out loud"

/**
 * Returns a chat context with one finding, two sources, one scan note, and no attachments, for cases to override.
 */
export function toTestChatContext(overrides: Partial<ChatContext> = {}): ChatContext {
	return {
		topicName: "AI startups worth applying to",
		topicPrompt: "Series A and B startups hiring founding engineers",
		topicSettings: {
			frequency: "weekly",
			scheduledTime: "09:00:00",
			scheduledDayOfWeek: "monday",
			visibility: "private",
			tags: ["ai", "hiring"],
			maxTopicFindings: 10,
		},
		findings: [
			{
				title: "16 Series B Startups Hiring Right Now",
				url: "https://example.com/series-b",
				foundAt: new Date("2026-07-14T09:00:00Z"),
				relevanceScore: 0.91,
				relevanceExplanation: "Names four companies hiring founding engineers.",
				text: "Careerport is hiring a founding AI engineer.",
			},
		],
		sources: ["rss — news.ycombinator.com", "reddit — r/startups"],
		scanSummaries: ["Found 12 new posts, kept 4."],
		attachmentContext: "",
		chatAttachmentContext: "",
		docsBlock: "",
		...overrides,
	}
}
