// Topic Post discussion tests: the player's shape of a recording, the card's line, its transcript, and when the card
// and Regenerate show
import { expect, test } from "bun:test"
import {
	toDiscussionTopicPostId,
	toTopicPostDiscussionAudioPath,
	toTopicPostDiscussionPodcastEpisode,
} from "@carlnotes/contracts/topicPosts"
import { toPodcastEpisodeTitleLabel } from "./labels"
import {
	isDiscussionRegenerateShown,
	isTopicPostDiscussionShown,
	toTopicPostDiscussionDetailsText,
	toTopicPostDiscussionInfoText,
	toTopicPostDiscussionTranscript,
} from "./topicPostDiscussions"
import { TOPIC_POST_DISCUSSION_EDITOR_STORY, TOPIC_POST_DISCUSSION_STORY } from "./topicPostStories"

test("a recording plays in the podcast player under the post's id, with the post's page and no chapters", () => {
	const podcastEpisode = toTopicPostDiscussionPodcastEpisode(TOPIC_POST_DISCUSSION_STORY)
	const topicPostId = TOPIC_POST_DISCUSSION_STORY.id
	expect(podcastEpisode).toMatchObject({
		id: `topic-post-discussion:${topicPostId}:discussion-1`,
		pagePath: TOPIC_POST_DISCUSSION_STORY.path,
		audioUrl: toTopicPostDiscussionAudioPath(topicPostId),
		durationSeconds: 184,
		episodeNumber: null,
		chapters: [],
		progressSeconds: 0,
		isVoiceChatConfigured: false,
	})

	// the player's id leads back to the post, and a podcast episode's own id does not
	expect(toDiscussionTopicPostId(podcastEpisode?.id ?? "")).toBe(topicPostId)
	expect(toDiscussionTopicPostId("episode-1")).toBeNull()

	// its title reads with no episode number, and never shortens the discussion's name
	expect(toPodcastEpisodeTitleLabel(podcastEpisode ?? { episodeNumber: 1, title: "" })).toBe(
		`Coffee Break Discussion · ${TOPIC_POST_DISCUSSION_STORY.title}`,
	)
})

test("a post with no recording, or one still on its way, has nothing to play", () => {
	expect(toTopicPostDiscussionPodcastEpisode({ ...TOPIC_POST_DISCUSSION_STORY, discussion: null })).toBeNull()
	const firstRecording = { id: null, durationSeconds: null, publishedAt: null, isRecording: true }
	expect(toTopicPostDiscussionPodcastEpisode({ ...TOPIC_POST_DISCUSSION_STORY, discussion: firstRecording })).toBeNull()
})

test("the popup's line is the recording's day, its length, and who talks, or the length and who talks", () => {
	const recording = { publishedAt: "2026-11-04T12:00:00.000Z", durationSeconds: 184 }
	expect(toTopicPostDiscussionInfoText(recording)).toBe("Nov 4 · 3 min · Carl and Vienna discuss amongst themselves")
	expect(toTopicPostDiscussionInfoText({ ...recording, publishedAt: null })).toBe(
		"3 min · Carl and Vienna discuss amongst themselves",
	)
})

test("the card's line is the length, a recording on its way, or that there is none", () => {
	expect(toTopicPostDiscussionDetailsText(TOPIC_POST_DISCUSSION_STORY)).toBe(
		"3 min · Carl and Vienna discuss amongst themselves",
	)
	// the first recording, a new one over a recording that plays, and none
	const quota = { discussionRegenerationQuota: null }
	const firstRecording = { id: null, durationSeconds: null, publishedAt: null, isRecording: true }
	const nextRecording = { id: "discussion-1", durationSeconds: 184, publishedAt: null, isRecording: true }
	expect(toTopicPostDiscussionDetailsText({ ...quota, discussion: firstRecording })).toBe(
		"Carl and Vienna are discussing.",
	)
	expect(toTopicPostDiscussionDetailsText({ ...quota, discussion: nextRecording })).toBe(
		"Carl and Vienna are discussing it again.",
	)
	expect(toTopicPostDiscussionDetailsText({ ...quota, discussion: null })).toBe("Not recorded yet.")
})

test("the card opens a recording's transcript in its turns' order, and none while one records or with no turns", () => {
	// the story's recording plays, with four turns
	const { discussion } = TOPIC_POST_DISCUSSION_STORY
	const transcript = toTopicPostDiscussionTranscript(TOPIC_POST_DISCUSSION_STORY)
	expect(transcript?.map(({ speakerName }) => speakerName)).toEqual(["Carl", "Vienna", "Carl", "Vienna"])
	expect(transcript?.[0]?.text).toBe("Vienna, this post ranks a year of light roasts.")

	// the transcript of the story's discussion with some of its fields changed
	const quota = { discussionRegenerationQuota: null }
	const toTranscript = (changes: Partial<NonNullable<typeof discussion>>): typeof transcript =>
		toTopicPostDiscussionTranscript({ ...quota, discussion: discussion && { ...discussion, ...changes } })

	// a new recording on its way over one that plays, a first recording, no turns, a response without the field, and
	// no discussion
	expect(toTranscript({ isRecording: true })).toBeNull()
	expect(toTranscript({ id: null, isRecording: true })).toBeNull()
	expect(toTranscript({ transcript: [] })).toBeNull()
	expect(toTranscript({ transcript: undefined })).toBeNull()
	expect(toTopicPostDiscussionTranscript({ ...quota, discussion: null })).toBeNull()
})

test("the card shows to anyone once there is a discussion, and before that to whoever may record one", () => {
	expect(isTopicPostDiscussionShown(TOPIC_POST_DISCUSSION_STORY)).toBe(true)
	expect(isTopicPostDiscussionShown({ ...TOPIC_POST_DISCUSSION_STORY, discussion: null })).toBe(false)
	expect(isTopicPostDiscussionShown({ ...TOPIC_POST_DISCUSSION_EDITOR_STORY, discussion: null })).toBe(true)
})

test("Regenerate shows with a regeneration left and nothing recording, and is absent at the limit", () => {
	expect(isDiscussionRegenerateShown(TOPIC_POST_DISCUSSION_EDITOR_STORY)).toBe(true)
	expect(isDiscussionRegenerateShown(TOPIC_POST_DISCUSSION_STORY)).toBe(false)

	// the month's limit, and a recording on its way
	const atLimit = { ...TOPIC_POST_DISCUSSION_EDITOR_STORY, discussionRegenerationQuota: { used: 10, limit: 10 } }
	expect(isDiscussionRegenerateShown(atLimit)).toBe(false)
	const recording = { id: "discussion-1", durationSeconds: 184, publishedAt: null, isRecording: true }
	expect(isDiscussionRegenerateShown({ ...TOPIC_POST_DISCUSSION_EDITOR_STORY, discussion: recording })).toBe(false)
})
