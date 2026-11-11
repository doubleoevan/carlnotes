// the site search's Topic Post reader: the published Topic Posts whose title, summary, or body text contains the
// query, on the topics the user may open, title matches first and then the newest
import type { TopicPostSearchRow } from "@carlnotes/contracts/search"
import { toTopicPostPath } from "@carlnotes/contracts/seo"
import { toTopicImageUrlsOrNull, toTopicPostImageUrls } from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { and, desc, eq, isNotNull, like, or, type SQL, sql } from "drizzle-orm"
import { toProfileIdentity } from "../avatars"
import { toContainsLikePattern } from "../likePattern"
import { toTopicViewFilter } from "../topic/permissions"

// who is searching, whether they are an admin, the trimmed query, the most rows to read, and the filter the Topic
// Post's topic's tags must pass
type SearchTopicPostsOptions = {
	userId: string | null
	isAdmin: boolean
	query: string
	limit: number
	topicTagFilter?: SQL
}

/**
 * Returns the published Topic Posts whose title, summary, or body text contains the query, on the topics the user may
 * open, title matches first and then the newest. A draft is never found.
 */
export async function searchTopicPosts(
	searchTopicPostsOptions: SearchTopicPostsOptions,
): Promise<TopicPostSearchRow[]> {
	const topicPostRows = await toTopicPostSearchQuery(searchTopicPostsOptions)

	// shape each Topic Post as a search row. the inner join always finds the author, and the filter keeps published
	// Topic Posts alone
	return topicPostRows.flatMap(({ topicPost, topic, author }) => {
		const authorIdentity = toProfileIdentity(author)
		if (!authorIdentity || !topicPost.publishedAt) {
			return []
		}
		return {
			kind: "topicPost" as const,
			id: topicPost.id,
			name: topicPost.title,
			path: toTopicPostPath(topic, topicPost),
			date: topicPost.publishedAt.toISOString(),
			count: null,
			topicPost: {
				author: authorIdentity,
				summary: topicPost.summary,
				// the post's own image, or its topic's until the post's is drawn
				image: topicPost.imageHash
					? toTopicPostImageUrls(topicPost.id, topicPost.imageHash)
					: toTopicImageUrlsOrNull(topic.id, topic.imageHash),
			},
			topic: { id: topic.id, name: topic.name },
		}
	})
}

// the Topic Post search's query: the title, summary, or body text match on the published Topic Posts of the topics the
// user may open, title matches first and then the newest
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
function toTopicPostSearchQuery({ userId, isAdmin, query, limit, topicTagFilter }: SearchTopicPostsOptions) {
	// the matches, with the typed characters escaped so none acts as a wildcard. the body matches on its text, with
	// its tags taken out
	// ponytail: no index narrows these matches, so each search reads every published Topic Post's body. store the
	// body's text in its own column under a trigram index if the Topic Posts grow past a few thousand
	const likePattern = toContainsLikePattern(query)
	const isTitleMatch = like(sql`lower(${topicPosts.title})`, likePattern)
	const isSummaryMatch = like(sql`lower(${topicPosts.summary})`, likePattern)
	const isBodyMatch = like(sql`lower(regexp_replace(${topicPosts.html}, '<[^>]*>', ' ', 'g'))`, likePattern)

	// an admin may read every topic's Topic Posts, and everyone else the topics the view rules allow
	const topicViewFilter = isAdmin ? undefined : toTopicViewFilter(userId)
	return db
		.select({
			// the Topic Post's own columns, without its body
			topicPost: {
				id: topicPosts.id,
				title: topicPosts.title,
				summary: topicPosts.summary,
				publishedAt: topicPosts.publishedAt,
				imageHash: topicPosts.imageHash,
			},
			// its topic's name and image, and its author's identity
			topic: { id: topics.id, name: topics.name, imageHash: topics.imageHash },
			author: {
				userId: users.id,
				username: users.username,
				avatarSource: users.avatarSource,
				avatarKey: users.avatarKey,
			},
		})
		.from(topicPosts)
		.innerJoin(topics, eq(topicPosts.topicId, topics.id))
		.innerJoin(users, eq(topicPosts.authorUserId, users.id))
		.where(
			and(
				isNotNull(topicPosts.publishedAt),
				or(isTitleMatch, isSummaryMatch, isBodyMatch),
				topicViewFilter,
				topicTagFilter,
			),
		)
		.orderBy(sql`(${isTitleMatch}) desc`, desc(topicPosts.publishedAt))
		.limit(limit)
}
