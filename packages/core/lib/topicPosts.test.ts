// Topic Post copy tests: the word count's label, when the editor shows, what a failed write says, and what a post's
// share options take
import { expect, test } from "bun:test"
import { TOPIC_POST_DISCUSSION_STORY } from "./topicPostStories"
import {
	isTopicPostEditorShown,
	isTopicPostPinnable,
	isTopicPostUrlStale,
	TOPIC_POST_LABELS,
	toTopicPostDetails,
	toTopicPostDetailsText,
	toTopicPostFailureMessage,
	toTopicPostNotesMarkdown,
	toTopicPostShare,
	toTopicPostWordCount,
	toTopicPostWordCountLabel,
} from "./topicPosts"

test("the word count reads against the minimum until the body reaches it", () => {
	expect(toTopicPostWordCountLabel(0)).toBe("0 of 300 words")
	expect(toTopicPostWordCountLabel(299)).toBe("299 of 300 words")
	expect(toTopicPostWordCountLabel(300)).toBe("300 words")
	expect(toTopicPostWordCountLabel(1200)).toBe("1,200 words")
})

test("a body's words are counted over its text, not its markup", () => {
	expect(toTopicPostWordCount("<html><p>one <b>two</b></p><h1>three</h1></html>")).toBe(3)
	expect(toTopicPostWordCount("<html><br></html>")).toBe(0)
})

test("a draft always shows its editor, and a published post only while its author edits it inside its edit time", () => {
	expect(isTopicPostEditorShown({ publishedAt: null, isEditable: true }, false)).toBe(true)
	expect(isTopicPostEditorShown({ publishedAt: "2026-11-01T10:00:00Z", isEditable: true }, false)).toBe(false)
	expect(isTopicPostEditorShown({ publishedAt: "2026-11-01T10:00:00Z", isEditable: true }, true)).toBe(true)
	expect(isTopicPostEditorShown({ publishedAt: "2026-11-01T10:00:00Z", isEditable: false }, true)).toBe(false)
})

test("a Topic Post takes a pin once it is published on a public topic", () => {
	const publishedAt = "2026-11-03T16:00:00.000Z"
	expect(isTopicPostPinnable({ publishedAt, isTopicPublic: true })).toBe(true)
	expect(isTopicPostPinnable({ publishedAt, isTopicPublic: false })).toBe(false)
	expect(isTopicPostPinnable({ publishedAt: null, isTopicPublic: true })).toBe(false)
})

test("a published post's line gives its date and its reading time, and marks an edited post", () => {
	const publishedPost = { publishedAt: "2026-11-03T16:00:00.000Z", wordCount: 750 }
	expect(toTopicPostDetailsText(publishedPost)).toBe("Nov 3, 2026 · 3 min read")
	expect(toTopicPostDetailsText({ ...publishedPost, editedAt: null })).not.toContain("edited")
	expect(toTopicPostDetailsText({ ...publishedPost, editedAt: publishedPost.publishedAt })).toEndWith(" · edited")

	// a short post reads in a minute, and a draft gives no reading time
	expect(toTopicPostDetailsText({ ...publishedPost, wordCount: 40 })).toBe("Nov 3, 2026 · 1 min read")
	expect(toTopicPostDetailsText({ publishedAt: null, wordCount: 750 })).toBe("Draft")
})

test("a post page's details put its thread's comment count after the reading time and before edited", () => {
	const editedPost = { publishedAt: "2026-11-03T16:00:00.000Z", wordCount: 750, editedAt: "2026-11-03T16:05:00.000Z" }
	expect(toTopicPostDetails(editedPost, 4)).toEqual(["Nov 3, 2026", "3 min read", "4 hot takes", "edited"])
	expect(toTopicPostDetails({ ...editedPost, editedAt: null }, 1)).toEqual(["Nov 3, 2026", "3 min read", "1 hot take"])

	// a count of zero, a count that was not read, and a card's line all leave the count out
	expect(toTopicPostDetails(editedPost, 0)).toEqual(["Nov 3, 2026", "3 min read", "edited"])
	expect(toTopicPostDetails(editedPost, null)).toEqual(["Nov 3, 2026", "3 min read", "edited"])
	expect(toTopicPostDetailsText(editedPost)).toBe("Nov 3, 2026 · 3 min read · edited")
})

test("a failed write says why, and a failure with no words of its own gets the fallback", () => {
	expect(toTopicPostFailureMessage({ status: "locked" }, "fallback")).toBe(TOPIC_POST_LABELS.lockedError)
	expect(toTopicPostFailureMessage({ status: "incomplete" }, "fallback")).toBe(TOPIC_POST_LABELS.incompleteError)
	expect(toTopicPostFailureMessage({ status: "failed", message: "Carl's words" }, "fallback")).toBe("Carl's words")
	expect(toTopicPostFailureMessage({ status: "failed", message: null }, "fallback")).toBe("fallback")
})

test("a post page's url moves to the post's titled path, and a url that left for another page is left alone", () => {
	const topicPost = { id: "post-1", path: "/topics/topic-1/home-espresso/posts/post-1/dialing-in" }
	const toIsStale = (pathname: string, topicPostId = "post-1"): boolean =>
		isTopicPostUrlStale({ pathname, topicPostId, topicPost })

	// the id-only url and a stale slug move, and the post's own path stays
	expect(toIsStale("/topics/topic-1/x/posts/post-1")).toBe(true)
	expect(toIsStale("/topics/topic-1/home-espresso/posts/post-1/an-old-title")).toBe(true)
	expect(toIsStale(topicPost.path)).toBe(false)

	// a navigation to sign-up, and a url that names another post while this one still shows, are not pulled back
	expect(toIsStale("/signup")).toBe(false)
	expect(toIsStale("/topics/topic-1/home-espresso/posts/post-2", "post-2")).toBe(false)
})

test("a Topic Post's copied notes link its title, then give its summary once it is written", () => {
	const topicPost = { title: "Light roasts, ranked", path: "/topics/topic-1/home-espresso/posts/post-1/light-roasts" }

	// the title links to the post's page on the given origin, with the summary under it
	expect(
		toTopicPostNotesMarkdown({ ...topicPost, summary: "Three roasts, tasted blind.", origin: "https://carlnotes.com" }),
	).toBe(
		"# [Light roasts, ranked](https://carlnotes.com/topics/topic-1/home-espresso/posts/post-1/light-roasts)\n\nThree roasts, tasted blind.",
	)

	// a post with no summary yet copies its linked title alone
	expect(toTopicPostNotesMarkdown({ ...topicPost, summary: null })).toBe(`# [Light roasts, ranked](${topicPost.path})`)
})

test("a post's share options take its topic at its visibility and the post in the topic's place", () => {
	const topicPost = { ...TOPIC_POST_DISCUSSION_STORY, isTopicPublic: false, topicVisibility: "invite" as const }
	expect(toTopicPostShare(topicPost)).toEqual({
		topic: { id: topicPost.topicId, name: topicPost.topicName, visibility: "invite", isTopicOwner: true },
		topicPost: { id: topicPost.id, title: topicPost.title, path: topicPost.path },
	})

	// a response with no visibility field shares a topic that is not public as a private one
	const olderTopicPost = { ...topicPost, topicVisibility: undefined }
	expect(toTopicPostShare(olderTopicPost).topic.visibility).toBe("private")
	expect(toTopicPostShare({ ...olderTopicPost, isTopicPublic: true }).topic.visibility).toBe("public")
})
