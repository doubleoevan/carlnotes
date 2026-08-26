// link previews for a public Topic: the image a platform fetches, and the meta tags it reads to find it
import { and, count, eq } from "drizzle-orm"
import { db } from "../../db"
import { findings, sources, teamMembers, teams, topics, users } from "../../db/schema"
import { attachmentExists, getAttachmentBytes, putAttachment } from "../../worker"
import { toPublishedAvatar } from "../avatars"
import { countDistinctSubscribers } from "../profiles"
import { isShown } from "../topic/permissions"
import { type ProfilePreview, toProfilePreviewKey, toProfilePreviewPng } from "./profileImage"
import { type TeamPreview, toTeamPreviewKey, toTeamPreviewPng } from "./teamImage"
import { type TopicPreview, toTopicPreviewKey, toTopicPreviewPng } from "./topicImage"

// how long a crawler and a browser may hold a preview. the key only changes when the preview does.
const PREVIEW_CACHE_CONTROL = "public, max-age=31536000, immutable"

/**
 * What a Topic's preview says, or null when no Topic has that id.
 * Every Topic gets a preview whatever its visibility, so a pasted link never looks broken.
 */
export async function toTopicPreview(topicId: string): Promise<TopicPreview | null> {
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
	// a topic that doesn't exist does not get a preview
	if (!row) {
		return null
	}

	// what the Topic holds, which is the only part of the preview that changes when it scans
	const [keptRow] = await db.select({ kept: count() }).from(findings).where(eq(findings.topicId, topicId))
	const [sourceRow] = await db
		.select({ sources: count() })
		.from(sources)
		.where(and(eq(sources.topicId, topicId), eq(sources.status, "ready")))
	// which image the owner publishes, named instead of loaded
	return {
		topicId: row.topicId,
		title: row.title,
		visibility: row.visibility,
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
export async function toCachedTopicPreviewPng(
	preview: TopicPreview,
): Promise<{ bytes: Uint8Array; cacheControl: string }> {
	return toCachedPng(toTopicPreviewKey(preview), () => toTopicPreviewPng(preview))
}

/**
 * A profile's preview bytes, rendered on the first request and read from storage after.
 * Rendering the image requires a font parse and a rasterize, so it only happens once per distinct preview.
 */
export async function toCachedProfilePreviewPng(
	preview: ProfilePreview,
): Promise<{ bytes: Uint8Array; cacheControl: string }> {
	return toCachedPng(toProfilePreviewKey(preview), () => toProfilePreviewPng(preview))
}

// track pending render by their preview key
const pendingRenderByPreviewKey = new Map<string, Promise<Uint8Array>>()

// the stored bytes for the key, or a render and store on the first request for this exact preview
async function toCachedPng(
	previewKey: string,
	renderPng: () => Promise<Uint8Array>,
): Promise<{ bytes: Uint8Array; cacheControl: string }> {
	if (await attachmentExists(previewKey)) {
		return { bytes: await getAttachmentBytes(previewKey), cacheControl: PREVIEW_CACHE_CONTROL }
	}

	// a miss joins the render already running for this key, or starts one and drops the entry once settled
	let render = pendingRenderByPreviewKey.get(previewKey)
	if (!render) {
		render = renderAndStorePng(previewKey, renderPng)
		pendingRenderByPreviewKey.set(previewKey, render)
		render.finally(() => pendingRenderByPreviewKey.delete(previewKey)).catch(() => {})
	}
	return { bytes: await render, cacheControl: PREVIEW_CACHE_CONTROL }
}

// render the png and store it, so the next fetch of this exact preview is a storage read
async function renderAndStorePng(previewKey: string, renderPng: () => Promise<Uint8Array>): Promise<Uint8Array> {
	const bytes = await renderPng()
	await putAttachment(previewKey, bytes, "image/png")
	return bytes
}

/**
 * A Topic page's own description, shared by the OG tags and the structured data.
 */
export function toTopicDescription(preview: TopicPreview): string {
	return preview.ownerUsername
		? `A topic by ${preview.ownerUsername}. ${preview.keptCount} findings Carl kept.`
		: `${preview.keptCount} findings Carl kept.`
}

/**
 * The app shell with a specific Topic's preview tags, title, and canonical URL to serve a crawler.
 * extraHeadTags includes anything else the route appends, like a structured-data script, and
 * extraBodyTags includes content for the body, like the noscript findings list.
 */
export function toTopicPreviewHtml(
	appShell: string,
	preview: TopicPreview,
	appUrl: string,
	extraHeadTags = "",
	extraBodyTags = "",
): string {
	const description = toTopicDescription(preview)
	const previewUrl = `${appUrl}/api/topics/${preview.topicId}/preview.png`
	const title = Bun.escapeHTML(preview.title)
	// X reads the Twitter tags before the og ones
	const tags = [
		`<title>${title} — CarlNotes</title>`,
		`<link rel="canonical" href="${appUrl}/topics/${preview.topicId}">`,
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
	return toShellWithHeadTags(appShell, `${tags}${extraHeadTags}`, extraBodyTags)
}

/**
 * What a profile's preview says, or null when no user has that id.
 */
export async function toProfilePreview(userId: string): Promise<ProfilePreview | null> {
	const [user] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, userId))
	if (!user) {
		return null
	}

	// the public figures the profile page itself shows a stranger
	const [topicRow] = await db
		.select({ publicTopics: count() })
		.from(topics)
		.where(and(eq(topics.ownerId, userId), eq(topics.visibility, "public"), isShown))
	return {
		userId: user.id,
		username: user.username,
		avatar: await toPublishedAvatar(user.id),
		publicTopicCount: topicRow?.publicTopics ?? 0,
		followerCount: await countDistinctSubscribers(userId),
	}
}

/**
 * What a team's card says, or null when there is no public team at that id.
 * A private team renders no card, and its page shows an outsider its name and nothing else.
 */
export async function toTeamPreview(teamId: string): Promise<TeamPreview | null> {
	// the id resolves the team, and a private one reads as no team at all
	const [team] = await db
		.select({ teamId: teams.id, name: teams.name, avatarKey: teams.avatarKey })
		.from(teams)
		.where(and(eq(teams.id, teamId), eq(teams.isPublic, true)))
	if (!team) {
		return null
	}

	// what the team page itself shows a stranger: how many members it has, and how many public topics it holds
	const [teamMembersRow] = await db
		.select({ members: count() })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, team.teamId), eq(teamMembers.isActive, true)))
	const [topicRow] = await db
		.select({ topics: count() })
		.from(topics)
		.where(and(eq(topics.teamId, team.teamId), eq(topics.visibility, "public"), isShown))

	// the avatar is named instead of loaded, so the card's key changes when the image does
	return {
		teamId: team.teamId,
		name: team.name,
		avatar: team.avatarKey ? { avatarKey: team.avatarKey } : null,
		memberCount: teamMembersRow?.members ?? 0,
		topicCount: topicRow?.topics ?? 0,
	}
}

/**
 * A team's preview image bytes, rendered on the first request and read from storage after.
 */
export async function toCachedTeamPreviewPng(
	preview: TeamPreview,
): Promise<{ bytes: Uint8Array; cacheControl: string }> {
	return toCachedPng(toTeamPreviewKey(preview), () => toTeamPreviewPng(preview))
}

/**
 * The app shell with a team's preview tags, title, and canonical URL.
 */
export function toTeamPreviewHtml(appShell: string, teamPreview: TeamPreview, appUrl: string): string {
	const name = Bun.escapeHTML(teamPreview.name)
	const membersWord = teamPreview.memberCount === 1 ? "member" : "members"
	const topicsWord = teamPreview.topicCount === 1 ? "public topic" : "public topics"
	const description = `${name} on CarlNotes. ${teamPreview.memberCount} ${membersWord}, ${teamPreview.topicCount} ${topicsWord}.`
	// the team's own rendered card, the image a platform unfurls beside the link
	const previewUrl = `${appUrl}/api/teams/${teamPreview.teamId}/preview.png`
	const tags = [
		`<title>${name} — CarlNotes</title>`,
		`<link rel="canonical" href="${appUrl}/teams/${teamPreview.teamId}">`,
		`<meta property="og:title" content="${name} — CarlNotes">`,
		`<meta property="og:description" content="${description}">`,
		`<meta property="og:image" content="${previewUrl}">`,
		`<meta property="og:image:alt" content="${name} — CarlNotes">`,
		`<meta property="og:url" content="${appUrl}/teams/${teamPreview.teamId}">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta name="twitter:title" content="${name} — CarlNotes">`,
		`<meta name="twitter:description" content="${description}">`,
		`<meta name="twitter:image" content="${previewUrl}">`,
	].join("")
	return toShellWithHeadTags(appShell, tags)
}

/**
 * The app shell with a profile's preview tags, title, and canonical URL, the treatment Topic pages get.
 */
export function toProfilePreviewHtml(appShell: string, preview: ProfilePreview, appUrl: string): string {
	const username = Bun.escapeHTML(preview.username)
	const topicsWord = preview.publicTopicCount === 1 ? "public topic" : "public topics"
	const followersWord = preview.followerCount === 1 ? "follower" : "followers"
	const description = `${username} on CarlNotes. ${preview.publicTopicCount} ${topicsWord}, ${preview.followerCount} ${followersWord}.`
	// the rendered card a platform unfurls beside the link
	const previewUrl = `${appUrl}/api/profiles/${preview.userId}/preview.png`
	const tags = [
		`<title>${username} — CarlNotes</title>`,
		`<link rel="canonical" href="${appUrl}/profiles/${preview.userId}">`,
		`<meta property="og:title" content="${username} — CarlNotes">`,
		`<meta property="og:description" content="${description}">`,
		`<meta property="og:image" content="${previewUrl}">`,
		`<meta property="og:image:alt" content="${username} — CarlNotes">`,
		`<meta property="og:url" content="${appUrl}/profiles/${preview.userId}">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta name="twitter:title" content="${username} — CarlNotes">`,
		`<meta name="twitter:description" content="${description}">`,
		`<meta name="twitter:image" content="${previewUrl}">`,
	].join("")
	return toShellWithHeadTags(appShell, tags)
}

/**
 * The app shell with the given head tags in place of the shell's own version of each. Every injecting
 * route builds its head through this. A tag the route leaves alone keeps the shell's site-wide default,
 * so a page that sets only a title still shows the default preview card.
 * bodyTags wrap the SPA root that the shell renders into.
 */
export function toShellWithHeadTags(appShell: string, headTags: string, bodyTags = ""): string {
	const body = toAppShellBody(appShell)
	return `${withoutReplacedTags(appShell, headTags)}${headTags}</head>${bodyTags ? body.replace(/<body[^>]*>/, (bodyTag) => `${bodyTag}${bodyTags}`) : body}`
}

// a meta-tag, capturing the property or name it has
const META_PROPERTY_PATTERN = /<meta\s+(?:property|name)="([^"]+)"[^>]*>/g

// the shell head with only the tags this route writes taken out, so appending the route's own tags leaves one of each
function withoutReplacedTags(appShell: string, headTags: string): string {
	const replacedProperties = new Set([...headTags.matchAll(META_PROPERTY_PATTERN)].map(([, property]) => property))
	const head = appShell.slice(0, appShell.indexOf("</head>"))
	return head
		.replace(/<title>[\s\S]*?<\/title>/, (title) => (headTags.includes("<title>") ? "" : title))
		.replace(/<link\s+rel="canonical"[^>]*>/, (link) => (headTags.includes('rel="canonical"') ? "" : link))
		.replaceAll(META_PROPERTY_PATTERN, (tag, property) => (replacedProperties.has(property) ? "" : tag))
}

// everything after the app shell head tag
function toAppShellBody(appShell: string): string {
	return appShell.slice(appShell.indexOf("</head>") + "</head>".length)
}
