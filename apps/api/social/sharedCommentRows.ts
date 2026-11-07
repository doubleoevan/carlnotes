// the comments a Topic shares with Carl, as the Topic's sources list shows them to a user who may edit the Topic
import { toSocialTargetPath } from "@carlnotes/contracts/seo"
import { type SharedComment, SOCIAL_PAGE_SIZE } from "@carlnotes/contracts/social"
import { db } from "@carlnotes/db"
import { toNoUserBlockBetweenFilter } from "@carlnotes/db/contentFilters"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { comments } from "@carlnotes/db/schema/social"
import { users } from "@carlnotes/db/schema/users"
import { isSharedCommentShown } from "@carlnotes/db/sharedComments"
import { and, desc, eq } from "drizzle-orm"
import { toProfileIdentity } from "../avatars"
import { socialAuthorColumns } from "./socialRows"

/**
 * Loads the comments a Topic shares with Carl as the user reads them, most recently shared first, each with the path
 * of the page that shows it.
 */
export async function loadSharedComments(
	topic: { id: string; name: string },
	userId: string,
): Promise<SharedComment[]> {
	// each shared comment with its author and, on a Podcast Episode, its season and number
	const sharedRows = await db
		.select({
			id: comments.id,
			authorUserId: comments.authorUserId,
			body: comments.body,
			sharedWithCarlAt: comments.sharedWithCarlAt,
			findingId: comments.findingId,
			season: podcastEpisodes.season,
			episodeNumber: podcastEpisodes.episodeNumber,
			...socialAuthorColumns,
		})
		.from(comments)
		.leftJoin(users, eq(users.id, comments.authorUserId))
		.leftJoin(podcastEpisodes, eq(podcastEpisodes.id, comments.podcastEpisodeId))
		.where(
			and(
				eq(comments.sharedTopicId, topic.id),
				isSharedCommentShown,
				toNoUserBlockBetweenFilter(userId, comments.authorUserId),
			),
		)
		.orderBy(desc(comments.sharedWithCarlAt))
		.limit(SOCIAL_PAGE_SIZE)

	// a comment opens on the page of what it hangs on
	return sharedRows.map(
		({ id, authorUserId, body, sharedWithCarlAt, findingId, season, episodeNumber, ...authorRow }) => ({
			id,
			author: toProfileIdentity({ ...authorRow, userId: authorUserId }),
			body,
			sharedAt: (sharedWithCarlAt ?? new Date()).toISOString(),
			path: toSocialTargetPath(topic, { findingId, season, episodeNumber }),
		}),
	)
}
