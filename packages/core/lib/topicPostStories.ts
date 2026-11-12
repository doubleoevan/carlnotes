// the Topic Posts both apps' stories show: a published Topic Post with a summary and reactions, its author's draft,
// and the bodies of a short draft and a ready one
import { EMPTY_COMMENT_THREAD, EMPTY_REACTION_SUMMARY } from "@carlnotes/contracts/social"
import type { TopicPostCard, TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { STORY_TOPIC_IMAGE } from "./storyFixtures"

// a body of the given number of words, in paragraphs of forty
function toStoryBodyHtml(wordCount: number): string {
	const words = Array.from({ length: wordCount }, (_, i) => (i % 9 === 8 ? "roast." : "bean"))
	const paragraphs: string[] = []
	for (let start = 0; start < words.length; start += 40) {
		paragraphs.push(`<p>${words.slice(start, start + 40).join(" ")}</p>`)
	}
	return paragraphs.join("")
}

// a published Topic Post on a public Topic, with a summary and reactions
export const TOPIC_POST_CARD_STORY: TopicPostCard = {
	id: "post-1",
	topicId: "topic-1",
	topicName: "Home espresso",
	title: "Light roasts, ranked by someone who was wrong about them",
	author: { userId: "user-1", username: "CoffeeReader", avatarSource: "generated", avatarVersion: null },
	publishedAt: "2026-11-03T16:00:00.000Z",
	wordCount: 412,
	image: STORY_TOPIC_IMAGE,
	summary: "A year of light roasts, ranked, with the three the author misjudged and what changed their mind.",
	reactionCount: 12,
	path: "/topics/topic-1/home-espresso/posts/post-1/light-roasts-ranked",
}

// the author's own draft, with a title and no summary or reactions yet
export const TOPIC_POST_DRAFT_CARD_STORY: TopicPostCard = {
	...TOPIC_POST_CARD_STORY,
	id: "post-2",
	title: "What the grinder taught me",
	publishedAt: null,
	wordCount: 120,
	summary: null,
	reactionCount: 0,
	path: "/topics/topic-1/home-espresso/posts/post-2/what-the-grinder-taught-me",
}

// a draft as its author's editor opens it, short of the fewest words
export const TOPIC_POST_SHORT_DRAFT_STORY: TopicPostResponse = {
	...TOPIC_POST_DRAFT_CARD_STORY,
	html: toStoryBodyHtml(120),
	version: 3,
	editedAt: null,
	isTopicPublic: true,
	topicImage: null,
	reactions: EMPTY_REACTION_SUMMARY,
	isTopicOwner: true,
	isAuthor: true,
	isEditable: true,
	canDelete: true,
	canPublish: true,
	canEditImage: true,
	imageRegenerationQuota: { used: 2, limit: 15 },
	imageOrigin: null,
	imagePrompt: null,
	discussion: null,
	discussionRegenerationQuota: null,
}

// a draft with a title and enough words to publish
export const TOPIC_POST_READY_DRAFT_STORY: TopicPostResponse = {
	...TOPIC_POST_SHORT_DRAFT_STORY,
	html: toStoryBodyHtml(320),
	wordCount: 320,
}

// a published Topic Post as a reader who may not record its discussion opens it, with a three-minute recording and
// its transcript of four turns, four comments on its thread, and its Topic's viewers and followers
export const TOPIC_POST_DISCUSSION_STORY: TopicPostResponse = {
	...TOPIC_POST_SHORT_DRAFT_STORY,
	...TOPIC_POST_CARD_STORY,
	topicCounts: { viewerCount: 128, subscriberCount: 14 },
	commentThread: { ...EMPTY_COMMENT_THREAD, commentCount: 4 },
	isAuthor: false,
	isEditable: false,
	canDelete: false,
	canPublish: false,
	canEditImage: false,
	imageRegenerationQuota: null,
	discussion: {
		id: "discussion-1",
		durationSeconds: 184,
		publishedAt: "2026-11-04T12:00:00.000Z",
		isRecording: false,
		transcript: [
			{ speakerName: "Carl", text: "Vienna, this post ranks a year of light roasts." },
			{ speakerName: "Vienna", text: "And admits to misjudging three of them, which I respect." },
			{ speakerName: "Carl", text: "Which one changed the author's mind?" },
			{ speakerName: "Vienna", text: "The one brewed a little cooler. Patience did the work." },
		],
	},
	discussionRegenerationQuota: null,
}

// the same Topic Post as whoever may publish on its Topic opens it, with regenerations left this month
export const TOPIC_POST_DISCUSSION_EDITOR_STORY: TopicPostResponse = {
	...TOPIC_POST_DISCUSSION_STORY,
	canPublish: true,
	discussionRegenerationQuota: { used: 1, limit: 10 },
}
