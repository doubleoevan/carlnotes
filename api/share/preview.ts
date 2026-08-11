// link previews for a public Topic: the image a platform fetches, and the meta tags it reads to find it.
// a crawler runs no JavaScript, so the tags have to be in the HTML the server sends, instead of added by the SPA
import { and, count, eq } from "drizzle-orm"
import { db } from "../../db"
import { findings, sources, topics, users } from "../../db/schema"
import { attachmentExists, getAttachmentBytes, putAttachment } from "../../worker"
import { toPublishedAvatar } from "../avatars"
import { type TopicPreview, toPreviewKey, toPreviewPng } from "./previewImage"

// how long a crawler and a browser may hold a preview. the key only changes when the preview does.
const PREVIEW_CACHE_CONTROL = "public, max-age=31536000, immutable"

/**
 * What a public Topic's preview says, or null when the Topic is not public.
 */
export async function toPublicTopicPreview(topicId: string): Promise<TopicPreview | null> {
	const [row] = await db
		.select({
			topicId: topics.id,
			title: topics.name,
			visibility: topics.visibility,
			ownerUserId: users.id,
			ownerUsername: users.username,
		})
		.from(topics)
		.innerJoin(users, eq(users.id, topics.ownerId))
		.where(eq(topics.id, topicId))
	// every public Topic gets a card, a platform fetches the card when the link is pasted and caches what it gets,
	if (row?.visibility !== "public") {
		return null
	}

	// what the Topic holds, which is the only part of the preview that changes when it scans
	const [keptRow] = await db.select({ kept: count() }).from(findings).where(eq(findings.topicId, topicId))
	const [sourceRow] = await db
		.select({ sources: count() })
		.from(sources)
		.where(and(eq(sources.topicId, topicId), eq(sources.status, "ready")))
	// which image the owner publishes, named rather than loaded. the topic preview key is built from this,
	// so a cache hit never pays to fetch the image itself. changing the avatar still lands the card on a new url
	return {
		topicId: row.topicId,
		title: row.title,
		ownerUserId: row.ownerUserId,
		ownerUsername: row.ownerUsername,
		ownerAvatar: await toPublishedAvatar(row.ownerUserId),
		keptCount: keptRow?.kept ?? 0,
		sourceCount: sourceRow?.sources ?? 0,
	}
}

/**
 * A Topic's preview bytes, rendered on the first request and read from storage after.
 * Rendering the image requires a font parse and a rasterize, so it only happens once per distinct preview.
 */
export async function toCachedPreviewPng(preview: TopicPreview): Promise<{ bytes: Uint8Array; cacheControl: string }> {
	const previewKey = toPreviewKey(preview)
	if (await attachmentExists(previewKey)) {
		return { bytes: await getAttachmentBytes(previewKey), cacheControl: PREVIEW_CACHE_CONTROL }
	}

	// a miss renders and stores, so the next fetch of this exact preview is a read
	const bytes = await toPreviewPng(preview)
	await putAttachment(previewKey, bytes, "image/png")
	return { bytes, cacheControl: PREVIEW_CACHE_CONTROL }
}

/**
 * The app shell with a specific Topic's preview tags to serve a social platform's crawler.
 */
export function toPreviewHtml(appShell: string, preview: TopicPreview, appUrl: string): string {
	const description = preview.ownerUsername
		? `A topic by ${preview.ownerUsername}. ${preview.keptCount} findings Carl kept.`
		: `${preview.keptCount} findings Carl kept.`
	const previewUrl = `${appUrl}/api/topics/${preview.topicId}/preview.png`
	const title = Bun.escapeHTML(preview.title)
	// X reads the Twitter tags before the og ones, so a topic that only set og:title
	// would still be shared with whatever title the shell carries
	const tags = [
		`<meta property="og:title" content="${title}">`,
		`<meta property="og:description" content="${Bun.escapeHTML(description)}">`,
		`<meta property="og:image" content="${previewUrl}">`,
		`<meta property="og:image:alt" content="${title}">`,
		`<meta property="og:url" content="${appUrl}/topics/${preview.topicId}">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta name="twitter:title" content="${title}">`,
		`<meta name="twitter:description" content="${Bun.escapeHTML(description)}">`,
		`<meta name="twitter:image" content="${previewUrl}">`,
	].join("")
	return `${withoutReplacedTags(appShell)}${tags}</head>${toAppShellBody(appShell)}`
}

// the preview tags that a Topic overrides. the shell renders a site-wide default for each.
// appending without removing those tags leaves two of every tag.
const REPLACED_PREVIEW_PROPERTIES = new Set([
	"og:title",
	"og:description",
	"og:image",
	"og:image:alt",
	"og:url",
	"twitter:card",
	"twitter:title",
	"twitter:description",
	"twitter:image",
])

// the shell with the tags a Topic replaces taken out, so only the Topic's version of each survives
function withoutReplacedTags(appShell: string): string {
	const head = appShell.slice(0, appShell.indexOf("</head>"))
	return head.replaceAll(/<meta\s+(?:property|name)="([^"]+)"[^>]*>/g, (tag, property) =>
		REPLACED_PREVIEW_PROPERTIES.has(property) ? "" : tag,
	)
}

// everything after the app shell head tag
function toAppShellBody(appShell: string): string {
	return appShell.slice(appShell.indexOf("</head>") + "</head>".length)
}
