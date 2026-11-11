// the unseen Comment Mentions the web and mobile stories show
import type { UnseenCommentMention } from "@carlnotes/contracts/commentMentions"

// the Topic every story mention sits on
const STORY_TOPIC_ID = "topic-espresso"

/**
 * Three unseen mentions, newest first: one on a Topic's thread, one by Carl on a Finding, and one on a Podcast
 * Episode with a line long enough to wrap.
 */
export const COMMENT_MENTION_STORIES: UnseenCommentMention[] = [
	{
		commentId: "comment-1",
		author: { userId: "user-roastfan", username: "RoastFan" },
		text: "@Evan the flat burr claim does not hold for light roasts",
		createdAt: "2026-11-09T12:00:00.000Z",
		topicId: STORY_TOPIC_ID,
		target: { kind: "topic", id: STORY_TOPIC_ID },
		page: { kind: "topic", id: STORY_TOPIC_ID, name: "Home espresso" },
		path: "/topics/topic-espresso/home-espresso?comment=comment-1",
	},
	{
		commentId: "comment-2",
		author: null,
		text: "Noted, @Evan.",
		createdAt: "2026-11-09T11:00:00.000Z",
		topicId: STORY_TOPIC_ID,
		target: { kind: "finding", id: "coffee-0" },
		page: { kind: "topic", id: STORY_TOPIC_ID, name: "Home espresso" },
		path: "/topics/topic-espresso/home-espresso?finding=coffee-0&comment=comment-2",
	},
	{
		commentId: "comment-3",
		author: { userId: "user-ava", username: "Ava" },
		text: "@Evan this is the episode I told you about, the one where they weigh every shot and still argue about the grinder for ten minutes",
		createdAt: "2026-11-08T09:00:00.000Z",
		topicId: STORY_TOPIC_ID,
		target: { kind: "podcastEpisode", id: "episode-1" },
		page: { kind: "podcastEpisode", id: "episode-1", name: "Grinders, scales, and the pour" },
		path: "/topics/topic-espresso/home-espresso/episodes/2026/4?comment=comment-3",
	},
]
