// what Remove takes down from a report: it deletes a comment through the comment delete, resets a reported avatar, and
// draws a reported image again, and Block leaves an avatar and a podcast episode's images as they are
import { afterEach, expect, spyOn, test } from "bun:test"
import * as avatars from "@carlnotes/db/avatars"
import { type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import * as sessions from "@carlnotes/db/sessions"
import * as store from "@carlnotes/db/store"
import * as podcastEpisodeImageRenders from "@carlnotes/pipeline/podcast/podcastEpisodeImageRenders"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as topicPodcastEpisodeVideoImage from "@carlnotes/pipeline/topicPodcastEpisodeVideo/topicPodcastEpisodeVideoImage"
import * as topicPostImageRenders from "@carlnotes/pipeline/topicPosts/topicPostImageRenders"
import * as edgePurge from "@carlnotes/server/edgePurge"
import {
	expectReportClosed,
	PUBLISHED_AVATAR_KEY,
	resolveOpenReport,
	restoreAdminReportTest,
	UNCHECKED_AVATAR_KEY,
} from "./adminReportTestFixtures"

// put the connection pool, the auth secret, and every spy back after each test
afterEach(restoreAdminReportTest)

// the keys the sent queries recorded as pending deletions
function toPendingDeletionKeys(sentQueries: SentQuery[]): unknown[] {
	return sentQueries
		.filter(({ text }) => text.startsWith('insert into "pending_object_deletions"'))
		.flatMap(({ values }) => values.filter((value) => typeof value === "string"))
}

// spy the session refresh, the object delete, and the edge purge, which reach Redis, object storage, and Cloudflare.
// returns the purge's spy and each deleted key in the order the deletes ran
function spyAvatarResetSideEffects(): { purgeSpy: ReturnType<typeof spyOn>; deletedObjectKeys: string[] } {
	const deletedObjectKeys: string[] = []
	spyOn(sessions, "refreshSessionUser").mockResolvedValue(undefined)
	spyOn(store, "deleteStoredObjects").mockImplementation(async (objectKeys: string[]) => {
		deletedObjectKeys.push(...objectKeys)
	})

	// the purge, which a reset sends once
	const purgeSpy = spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()
	return { purgeSpy, deletedObjectKeys }
}

// spy the render's start and the two upload removals, with the film's id if the film's image was an upload
function spyPodcastEpisodeImageRegeneration(removedTopicPodcastEpisodeVideoId: string | null): {
	startRenderSpy: ReturnType<typeof spyOn>
	removePodcastEpisodeImageUploadSpy: ReturnType<typeof spyOn>
	removeTopicPodcastEpisodeVideoImageUploadSpy: ReturnType<typeof spyOn>
} {
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	const removePodcastEpisodeImageUploadSpy = spyOn(
		podcastEpisodeImageRenders,
		"removePodcastEpisodeImageUpload",
	).mockResolvedValue("topic-1")

	// the film's removal returns the film whose upload it removed, or null for a film with none
	const removeTopicPodcastEpisodeVideoImageUploadSpy = spyOn(
		topicPodcastEpisodeVideoImage,
		"removeTopicPodcastEpisodeVideoImageUpload",
	).mockResolvedValue(removedTopicPodcastEpisodeVideoId)
	return { startRenderSpy, removePodcastEpisodeImageUploadSpy, removeTopicPodcastEpisodeVideoImageUploadSpy }
}

// Remove deletes the comment by its note and id with no author clause, then closes the report
test("removing a reported comment deletes it as the admin", async () => {
	// the open report of a comment, and the comment's note
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", "noteComment", "c1"]]
		}
		return text.includes('from "note_comments"') ? [["n1"]] : []
	})

	// the removal
	const isResolved = await resolveOpenReport("removed")
	expect(isResolved).toBe(true)
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "note_comments"'))
	expect(deleteQuery?.values).toEqual(["c1", "n1"])
	expectReportClosed(sentQueries, "removed")
})

// Remove deletes a reported comment for everyone, and clears the cached unseen Comment Mentions of the users its
// thread mentions
test.each([["comment", "comments"]] as const)("removing a reported %s deletes it", async (subjectKind, table) => {
	// the open report, and the one user the comment's thread mentions
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", subjectKind, "subject-1", "author-1"]]
		}
		return text.includes('from "comment_mentions"') ? [["user-ava"]] : []
	})

	// the removal, with the delete of the cached reads spied
	const deleteRedisKeysSpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(0)
	const isResolved = await resolveOpenReport("removed")
	expect(isResolved).toBe(true)

	// the subject is deleted by its id, and its author is not under an admin block
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith(`delete from "${table}"`))
	expect(deleteQuery?.values).toEqual(["subject-1"])
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "users"'))).toBe(false)

	// the mentioned user's next read counts without the deleted comment
	expect(deleteRedisKeysSpy).toHaveBeenCalledWith("unseen-comment-mentions:user-ava")
})

// Reset avatar returns the user to the generated avatar, deletes the stored upload, and purges the avatar's tag
test("resetting a reported upload returns the user to the initials and purges the avatar once", async () => {
	// the open report of a profile, and the user's published upload with no unchecked avatar
	const { purgeSpy, deletedObjectKeys } = spyAvatarResetSideEffects()
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", "profile", "user-2", "user-2", "vienna"]]
		}
		return text.includes("for update") ? [[PUBLISHED_AVATAR_KEY, null]] : []
	})

	// the reset
	const isResolved = await resolveOpenReport("removed")
	expect(isResolved).toBe(true)

	// the user's row has the generated avatar and no stored or unchecked upload, and takes no admin block
	const userUpdates = sentQueries.filter(({ text }) => text.startsWith('update "users"'))
	expect(userUpdates).toHaveLength(1)
	expect(userUpdates[0]?.values.slice(0, 3)).toEqual(["generated", null, null])

	// the stored upload is recorded as a pending deletion, then deleted
	expect(toPendingDeletionKeys(sentQueries)).toEqual([PUBLISHED_AVATAR_KEY])
	expect(deletedObjectKeys).toEqual([PUBLISHED_AVATAR_KEY])

	// one purge names the user's avatar tag, and the report closes as removed
	expect(purgeSpy).toHaveBeenCalledTimes(1)
	expect(purgeSpy).toHaveBeenCalledWith("user-avatar:user-2")
	expectReportClosed(sentQueries, "removed")
})

// Reset avatar on a provider photo makes the avatar source generated, with no stored object to delete
test("resetting a reported provider photo makes the avatar source generated", async () => {
	// the open report of a profile, whose user has no stored upload and no unchecked avatar
	const { purgeSpy, deletedObjectKeys } = spyAvatarResetSideEffects()
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", "profile", "user-2", "user-2", "vienna"]]
		}
		return text.includes("for update") ? [[null, null]] : []
	})

	// the reset
	await resolveOpenReport("removed")

	// the avatar source is generated, and nothing is deleted
	const userUpdate = sentQueries.find(({ text }) => text.startsWith('update "users"'))
	expect(userUpdate?.values.slice(0, 3)).toEqual(["generated", null, null])
	expect(deletedObjectKeys).toEqual([])

	// one purge names the user's avatar tag, and the report closes as removed
	expect(purgeSpy).toHaveBeenCalledTimes(1)
	expect(purgeSpy).toHaveBeenCalledWith("user-avatar:user-2")
	expectReportClosed(sentQueries, "removed")
})

// Reset avatar goes through the avatar write that drops an unchecked upload, so the unchecked upload is deleted too
test("resetting a reported avatar deletes the user's unchecked avatar too", async () => {
	// the open report of a profile, and the user's published upload with a newer unchecked avatar
	const { deletedObjectKeys } = spyAvatarResetSideEffects()
	const replaceAvatarSpy = spyOn(avatars, "replaceAvatar")
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", "profile", "user-2", "user-2", "vienna"]]
		}
		return text.includes("for update") ? [[PUBLISHED_AVATAR_KEY, UNCHECKED_AVATAR_KEY]] : []
	})

	// the reset
	await resolveOpenReport("removed")

	// the reset is the avatar write to the generated avatar, which drops the unchecked avatar and deletes both uploads
	expect(replaceAvatarSpy).toHaveBeenCalledWith("user-2", "generated", null)
	expect(sentQueries.some(({ text }) => text.startsWith('delete from "unchecked_images"'))).toBe(true)
	expect(deletedObjectKeys).toEqual([PUBLISHED_AVATAR_KEY, UNCHECKED_AVATAR_KEY])
	expectReportClosed(sentQueries, "removed")
})

// Reset avatar on a team report leaves the team with no avatar, deletes its upload, and purges the team avatar's tag
test("resetting a reported team avatar leaves the team with no avatar and purges it once", async () => {
	// the open report of a team, which has no author, and the team's stored upload
	const { purgeSpy, deletedObjectKeys } = spyAvatarResetSideEffects()
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", "team", "team-1", null, "River Lab"]]
		}
		return text.includes("for update") ? [["avatars/teams/team-1/published.png"]] : []
	})

	// the reset
	const isResolved = await resolveOpenReport("removed")
	expect(isResolved).toBe(true)

	// the team's row has no avatar, and its upload is deleted
	const teamUpdate = sentQueries.find(({ text }) => text.startsWith('update "teams"'))
	expect(teamUpdate?.values[0]).toBeNull()
	expect(deletedObjectKeys).toEqual(["avatars/teams/team-1/published.png"])

	// one purge names the team's avatar tag, and the report closes as removed
	expect(purgeSpy).toHaveBeenCalledTimes(1)
	expect(purgeSpy).toHaveBeenCalledWith("team-avatar:team-1")
	expectReportClosed(sentQueries, "removed")
})

// Regenerate on a podcast episode drops an uploaded image and draws a new one that no user is billed for
test("regenerating a reported podcast episode's image renders as the admin, with no user", async () => {
	// the open report of a podcast episode whose film has no uploaded image, and the podcast episode's topic
	const { startRenderSpy, removePodcastEpisodeImageUploadSpy } = spyPodcastEpisodeImageRegeneration(null)
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", "podcastEpisode", "podcast-episode-1", "owner-1", "Agents that read the docs"]]
		}
		return text.includes('from "episodes"') ? [["topic-1"]] : []
	})

	// the regeneration
	const isResolved = await resolveOpenReport("removed")
	expect(isResolved).toBe(true)

	// the upload is dropped, and the one render names the podcast episode and bills the platform's budget
	expect(removePodcastEpisodeImageUploadSpy).toHaveBeenCalledWith("podcast-episode-1")
	expect(startRenderSpy).toHaveBeenCalledTimes(1)
	expect(startRenderSpy).toHaveBeenCalledWith(
		expect.objectContaining({ topicId: "topic-1", podcastEpisodeId: "podcast-episode-1", userId: null, kind: "admin" }),
	)

	// an unchecked upload for the podcast episode's image or its film's is dropped
	const uncheckedImageDeletes = sentQueries.filter(({ text }) => text.startsWith('delete from "unchecked_images"'))
	expect(uncheckedImageDeletes.map(({ values }) => values)).toEqual([
		["podcastEpisodeImage", "podcast-episode-1"],
		["topicPodcastEpisodeVideoImage", "podcast-episode-1"],
	])

	// the Topic's owner takes no admin block, and the report closes as removed
	expect(sentQueries.some(({ text }) => text.startsWith('update "users"'))).toBe(false)
	expectReportClosed(sentQueries, "removed")
})

// the same Regenerate draws the film's image again too, if the film's image was an upload
test("regenerating a reported podcast episode draws its film's uploaded image again", async () => {
	// the open report of a podcast episode whose film has an uploaded image, and the podcast episode's topic
	const { startRenderSpy, removeTopicPodcastEpisodeVideoImageUploadSpy } = spyPodcastEpisodeImageRegeneration("video-1")
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", "podcastEpisode", "podcast-episode-1", "owner-1", "Agents that read the docs"]]
		}
		return text.includes('from "episodes"') ? [["topic-1"]] : []
	})

	// the regeneration
	await resolveOpenReport("removed")

	// the film's upload is dropped, and a second render names the film and bills the platform's budget
	expect(removeTopicPodcastEpisodeVideoImageUploadSpy).toHaveBeenCalledWith("podcast-episode-1")
	expect(startRenderSpy).toHaveBeenCalledTimes(2)
	expect(startRenderSpy).toHaveBeenCalledWith(
		expect.objectContaining({
			topicId: "topic-1",
			topicPodcastEpisodeVideoId: "video-1",
			userId: null,
			kind: "admin",
		}),
	)
	expectReportClosed(sentQueries, "removed")
})

// a podcast episode removed after its report has no image to draw
test("regenerating the image of a removed podcast episode renders nothing, and still closes the report", async () => {
	// the open report, and no podcast episode that is not removed
	const { startRenderSpy, removePodcastEpisodeImageUploadSpy, removeTopicPodcastEpisodeVideoImageUploadSpy } =
		spyPodcastEpisodeImageRegeneration("video-1")
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"')
			? [["report-1", "podcastEpisode", "podcast-episode-1", "owner-1", "Agents that read the docs"]]
			: [],
	)
	const isResolved = await resolveOpenReport("removed")
	expect(isResolved).toBe(true)

	// each read of the podcast episode leaves out a removed one
	const podcastEpisodeQueries = sentQueries.filter(({ text }) => text.includes('from "episodes"'))
	expect(podcastEpisodeQueries).toHaveLength(2)
	expect(podcastEpisodeQueries.every(({ values }) => values.includes("removed"))).toBe(true)

	// no upload is dropped and no render starts, and the report closes as removed
	expect(removePodcastEpisodeImageUploadSpy).not.toHaveBeenCalled()
	expect(removeTopicPodcastEpisodeVideoImageUploadSpy).not.toHaveBeenCalled()
	expect(startRenderSpy).not.toHaveBeenCalled()
	expectReportClosed(sentQueries, "removed")
})

// Block leaves a reported avatar and a reported podcast episode's images as they are
test.each([
	["profile", "user-2"],
	["team", null],
	["podcastEpisode", "owner-1"],
] as const)("blocking from a report of a %s resets and regenerates nothing", async (subjectKind, authorUserId) => {
	// the avatar writes, the purge, and the image regeneration, none of which Block may reach
	const replaceAvatarSpy = spyOn(avatars, "replaceAvatar").mockResolvedValue()
	const replaceTeamAvatarSpy = spyOn(avatars, "replaceTeamAvatar").mockResolvedValue()
	const { purgeSpy } = spyAvatarResetSideEffects()
	const { startRenderSpy, removePodcastEpisodeImageUploadSpy, removeTopicPodcastEpisodeVideoImageUploadSpy } =
		spyPodcastEpisodeImageRegeneration("video-1")

	// the open report of the subject, with its author if it has one, and a podcast episode that is not removed
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", subjectKind, "subject-1", authorUserId, "the subject"]]
		}
		return text.includes('from "episodes"') ? [["topic-1"]] : []
	})
	await resolveOpenReport("blocked")

	// an author takes the admin block, and the report closes as blocked
	expect(sentQueries.some(({ text }) => text.startsWith('update "users"'))).toBe(authorUserId !== null)
	expectReportClosed(sentQueries, "blocked")

	// the avatar stays, nothing is purged, and no image is dropped or drawn
	expect(replaceAvatarSpy).not.toHaveBeenCalled()
	expect(replaceTeamAvatarSpy).not.toHaveBeenCalled()
	expect(purgeSpy).not.toHaveBeenCalled()
	expect(removePodcastEpisodeImageUploadSpy).not.toHaveBeenCalled()
	expect(removeTopicPodcastEpisodeVideoImageUploadSpy).not.toHaveBeenCalled()
	expect(startRenderSpy).not.toHaveBeenCalled()
})

// Regenerate on a Topic's image drops an upload and draws a new image that no user is billed for
test("regenerating a reported topic image removes the upload and renders as the admin, with no user", async () => {
	// the open report of a topic's image, and the topic
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", "topicImage", "topic-1"]]
		}
		return text.includes('from "topics"') ? [["topic-1"]] : []
	})
	// the upload's removal and the render's start
	const removeUploadSpy = spyOn(topicImageRenders, "removeTopicImageUpload").mockResolvedValue(true)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	const isResolved = await resolveOpenReport("removed")
	expect(isResolved).toBe(true)

	// the render names the topic alone and bills the platform's budget, and the report closes
	expect(removeUploadSpy).toHaveBeenCalledWith("topic-1")
	expect(startRenderSpy).toHaveBeenCalledTimes(1)
	expect(startRenderSpy).toHaveBeenCalledWith(
		expect.objectContaining({ topicId: "topic-1", userId: null, kind: "admin" }),
	)

	// an unchecked upload for the topic's image is dropped, so the sweep never publishes it over the new image
	const uncheckedImageDeletes = sentQueries.filter(({ text }) => text.startsWith('delete from "unchecked_images"'))
	expect(uncheckedImageDeletes.map(({ values }) => values)).toEqual([["topicImage", "topic-1"]])
	expectReportClosed(sentQueries, "removed")
})

// Regenerate on a Topic Post's image drops an upload and draws a new image that no user is billed for
test("regenerating a reported post image removes the upload and renders as the admin, with no user", async () => {
	// the open report of a post's image, and the post's topic
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", "topicPostImage", "post-1"]]
		}
		return text.includes('from "topic_posts"') ? [["topic-1"]] : []
	})
	// the upload's removal and the render's start
	const removeUploadSpy = spyOn(topicPostImageRenders, "removeTopicPostImageUpload").mockResolvedValue(true)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	const isResolved = await resolveOpenReport("removed")
	expect(isResolved).toBe(true)

	// the render names the post and bills the platform's budget, and the report closes
	expect(removeUploadSpy).toHaveBeenCalledWith("post-1")
	expect(startRenderSpy).toHaveBeenCalledWith(
		expect.objectContaining({ topicId: "topic-1", topicPostId: "post-1", userId: null, kind: "admin" }),
	)
	expectReportClosed(sentQueries, "removed")
})

// a post deleted after its report has no image to draw
test("regenerating the image of a deleted post renders nothing, and still closes the report", async () => {
	// the open report of a post's image, and no post
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"') ? [["report-1", "topicPostImage", "post-1"]] : [],
	)
	const removeUploadSpy = spyOn(topicPostImageRenders, "removeTopicPostImageUpload").mockResolvedValue(false)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")

	// the regeneration removes no upload and starts no render
	const isResolved = await resolveOpenReport("removed")
	expect(isResolved).toBe(true)
	expect(removeUploadSpy).not.toHaveBeenCalled()
	expect(startRenderSpy).not.toHaveBeenCalled()
	expectReportClosed(sentQueries, "removed")
})
