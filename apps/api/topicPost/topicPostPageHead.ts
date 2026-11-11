// a Topic Post page's head: its titles, its description from the summary, its canonical url, its card, and the
// BlogPosting structured data of a public Topic's post
import type { PageHead } from "@carlnotes/contracts/pageHead"
import { toPageTitle, toTopicPostPath } from "@carlnotes/contracts/seo"
import { toCutText, toHtmlText } from "@carlnotes/contracts/text"
import { toTopicPostImageUrls } from "@carlnotes/contracts/topicImages"
import { toBlogPostingLd } from "../jsonLd"
import { toPreviewVersion } from "../share/previewImage"
import type { TopicPreview } from "../share/topicImage"
import { type TopicPostPreview, toTopicPostPreviewKey } from "../share/topicPostImage"
import type { TopicPostRow } from "./topicPosts"

// how much of a post's text describes it while it has no summary
const DESCRIPTION_MAX_CHARS = 200

// the published Topic Post, its Topic's preview, its own card's fields, and the app's url that the head is built from
type ToTopicPostPageHeadOptions = {
	topicPostRow: TopicPostRow
	topicPreview: TopicPreview
	topicPostPreview: TopicPostPreview
	appUrl: string
}

/**
 * Builds a published Topic Post page's head, with the card alone for a post of a private or invite Topic.
 */
export function toTopicPostPageHead({
	topicPostRow,
	topicPreview,
	topicPostPreview,
	appUrl,
}: ToTopicPostPageHeadOptions): PageHead {
	// the post's page path comes after its Topic's page path, and a public Topic's post is indexed
	const { topicPost, topic, author } = topicPostRow
	const pageUrl = `${appUrl}${toTopicPostPath(topic, topicPost)}`
	const isPublicTopic = topic.visibility === "public"

	// a public Topic's post is described by its summary, or by how its text starts until the summary is written. a
	// private or invite Topic's post keeps its words out of its head, which describes the Topic instead
	const description = isPublicTopic
		? (topicPost.summary ?? toCutText(toHtmlText(topicPost.html), DESCRIPTION_MAX_CHARS))
		: topicPreview.description

	// the post's own card, at the version its drawn fields name
	const previewVersion = toPreviewVersion(toTopicPostPreviewKey(topicPostPreview))
	const imageUrl = `${appUrl}/api/topic-posts/${topicPost.id}/preview.png?v=${previewVersion}`
	const cardPageHead = {
		title: toPageTitle(`${topicPost.title} · ${topic.name}`),
		cardTitle: topicPost.title,
		description,
		canonicalUrl: isPublicTopic ? pageUrl : null,
		cardUrl: pageUrl,
		imageUrl,
		feedUrl: null,
		isIndexed: isPublicTopic,
	}

	// a private or invite Topic's post has its card alone, and a public Topic's adds its structured data
	if (!isPublicTopic) {
		return { ...cardPageHead, jsonLd: null }
	}
	return {
		...cardPageHead,
		jsonLd: toBlogPostingLd({
			headline: topicPost.title,
			description,
			url: pageUrl,
			authorUsername: author.username,
			authorUrl: `${appUrl}/profiles/${author.userId}`,
			publishedAt: topicPost.publishedAt ?? topicPost.createdAt,
			editedAt: topicPost.editedAt,
			// the article's image is the post's own at its current hash, or its card until that image is drawn
			imageUrl: topicPost.imageHash
				? `${appUrl}${toTopicPostImageUrls(topicPost.id, topicPost.imageHash).page.url2x}`
				: imageUrl,
			appUrl,
		}),
	}
}
