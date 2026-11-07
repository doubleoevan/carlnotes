import { afterEach, expect, spyOn, test } from "bun:test"
import * as sharedComments from "@carlnotes/db/sharedComments"
import * as moderation from "@carlnotes/models/moderation"
import {
	isSharedCommentSpeakable,
	releaseUncreditedSharedComments,
	toSharedCommentPlacements,
} from "./podcastEpisodeSharedComments"

// an outline of two segments with one Finding each
const outline = {
	title: "Title",
	description: "Description",
	segments: [
		{ theme: "One", chapters: [{ findingId: "finding-1", minutes: 2 }] },
		{ theme: "Two", chapters: [{ findingId: "finding-2", minutes: 2 }] },
	],
}

// a shared comment on the given Finding, or on no Finding
function toSharedComment(findingId: string | null): sharedComments.PodcastSharedComment {
	return { commentId: `comment-${findingId}`, findingId, username: "roastfan", body: "A fair point." }
}

afterEach(() => {
	spyOn(moderation, "classifyUserText").mockRestore()
	spyOn(sharedComments, "loadAiredSharedComments").mockRestore()
	spyOn(sharedComments, "releasePodcastEpisodeSharedComments").mockRestore()
})

test("a script that never names an author gives that shared comment back", async () => {
	const credited = { ...toSharedComment("finding-1"), commentId: "credited", username: "RoastFan" }
	const uncredited = { ...toSharedComment("finding-2"), commentId: "uncredited", username: "silentreader" }
	const byCarl = { ...toSharedComment(null), commentId: "by-carl", username: null }
	spyOn(sharedComments, "loadAiredSharedComments").mockResolvedValue([credited, uncredited, byCarl])
	const release = spyOn(sharedComments, "releasePodcastEpisodeSharedComments").mockResolvedValue()

	await releaseUncreditedSharedComments("episode-1", "As roastfan said, it holds up.")
	expect(release).toHaveBeenCalledWith("episode-1", ["uncredited"])

	// a script that names everyone gives nothing back
	release.mockClear()
	await releaseUncreditedSharedComments("episode-1", "roastfan and silentreader agree.")
	expect(release).not.toHaveBeenCalled()
})

test("a shared comment goes in its Finding's chapter, and any other in the last segment's close", () => {
	const onNarrated = toSharedComment("finding-1")
	const onLater = toSharedComment("finding-2")
	const onTopic = toSharedComment(null)
	const onUnnarrated = toSharedComment("finding-9")
	const sharedComments = [onNarrated, onLater, onTopic, onUnnarrated]

	expect(toSharedCommentPlacements({ sharedComments, outline, segmentIndex: 0 })).toEqual({
		chapterSharedComments: [onNarrated],
		closingSharedComments: [],
	})
	expect(toSharedCommentPlacements({ sharedComments, outline, segmentIndex: 1 })).toEqual({
		chapterSharedComments: [onLater],
		closingSharedComments: [onTopic, onUnnarrated],
	})
})

test("the screen passes a clean comment and skips a flagged username or a failed call", async () => {
	const sharedComment = toSharedComment(null)
	const clean = { outcome: "classified", verdict: { isViolation: false, category: null } } as const
	const flagged = { outcome: "classified", verdict: { isViolation: true, category: "hate" } } as const

	// text and username both clean
	const classifySpy = spyOn(moderation, "classifyUserText").mockResolvedValue(clean)
	expect(await isSharedCommentSpeakable(sharedComment)).toBe(true)
	expect(classifySpy).toHaveBeenCalledTimes(2)

	// the username is flagged, and a classification with no moderation proxy passes
	classifySpy.mockImplementation(async ({ text }) => (text === "roastfan" ? flagged : clean))
	expect(await isSharedCommentSpeakable(sharedComment)).toBe(false)
	classifySpy.mockResolvedValue({ outcome: "skipped" })
	expect(await isSharedCommentSpeakable(sharedComment)).toBe(true)
})
