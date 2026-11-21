// a profile's page read: the head, the profile, and the first page of the week's news, served to visitors and to
// every signed-in reader of someone else's profile but an admin from one copy per profile
import { toCardsPage } from "@carlnotes/contracts/cardPages"
import { type ProfilePageRead, profilePageReadQuery, profileTopicPostsQuery } from "@carlnotes/contracts/pageReads"
import type { ProfileUserState } from "@carlnotes/contracts/pageUserStates"
import type { ProfileResponse, ProfileTopicPostCard } from "@carlnotes/contracts/profilePage"
import { readVisitorPage, toVisitorProfilePageKey } from "@carlnotes/db/visitorPageCaches"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { loadUserAvatarRow } from "./avatars"
import { toTopicPostCardsPage } from "./cardPages"
import { type AppEnv, currentProfileAudienceUser, currentUser } from "./currentUser"
import { renderedPageReadCacheHeaders } from "./edgeCache"
import { readPageReadNews } from "./pageReadNews"
import { loadProfileTopicPostCards } from "./profileCards"
import { loadProfileReader } from "./profileReader"
import { loadProfile } from "./profiles"
import { loadProfilePageHeadFromProfile } from "./share/pageHead"
import { loadTopicsUserState } from "./topic/topicsUserState"
import { loadUserBlocksBetween } from "./userBlocks"

/**
 * Serves `GET /api/profiles/:userId/page`, the profile's page read: the head, the profile, and the first page of the
 * week's news. A read with no session is served from the profile's copy, and the visitor audience of a signed-in admin
 * is read fresh. A read that asks for pages holds one page of the person's Topic Posts, except the person's own read,
 * which holds them all. Serves `GET /api/profiles/:userId/topic-posts` too, one later page of those Topic Posts.
 */
export const profilePageReadRoute = new Hono<AppEnv>()
	.get(
		"/profiles/:userId/page",
		renderedPageReadCacheHeaders,
		zValidator("query", profilePageReadQuery),
		async (context) => {
			const { audience, paged, topicPostsPage = 0 } = context.req.valid("query")
			const profileUserId = context.req.param("userId")
			const sessionUserId = currentUser(context)
			const profilePageRead = await readProfilePageRead({
				profileUserId,
				sessionUserId,
				audienceUserId: currentProfileAudienceUser(context, audience),
			})
			if (!profilePageRead) {
				return context.json({ error: "not found" }, 404)
			}

			// the person's own read holds every post, because their rank dialog ranks them all
			const isPaged = paged && sessionUserId !== profileUserId
			return context.json(
				isPaged
					? { ...profilePageRead, profile: toPagedProfile(profilePageRead.profile, topicPostsPage) }
					: profilePageRead,
			)
		},
	)
	.get("/profiles/:userId/topic-posts", zValidator("query", profileTopicPostsQuery), async (context) => {
		const { audience, page } = context.req.valid("query")
		const profileTopicPostCards = await readProfileTopicPostCards({
			profileUserId: context.req.param("userId"),
			sessionUserId: currentUser(context),
			audienceUserId: currentProfileAudienceUser(context, audience),
		})
		return profileTopicPostCards
			? context.json(toTopicPostCardsPage(profileTopicPostCards, page))
			: context.json({ error: "not found" }, 404)
	})

// the profile with one zero-based page of the person's Topic Posts and where the page sits
function toPagedProfile(profile: ProfileResponse, topicPostsPage: number): ProfileResponse {
	const { rows, position } = toCardsPage(profile.profileTopicPosts, topicPostsPage)
	return { ...profile, profileTopicPosts: rows, profileTopicPostsPage: position }
}

/**
 * Returns a person's Topic Post cards as the reader reads them, or null if no person has that id. A read with no
 * session takes them from the profile's copy, and a signed-in reader's are read for them: every post for the person,
 * and the posts of public topics for anyone else.
 */
async function readProfileTopicPostCards({
	profileUserId,
	sessionUserId,
	audienceUserId,
}: ReadProfilePageReadOptions): Promise<ProfileTopicPostCard[] | null> {
	if (!sessionUserId) {
		return (await readVisitorProfilePageRead(profileUserId))?.profile.profileTopicPosts ?? null
	}

	// the person must exist, and the posts are read for the audience the reader reads the profile as
	if (!(await loadUserAvatarRow(profileUserId))) {
		return null
	}
	const { profileTopicPosts } = await loadProfileTopicPostCards(profileUserId, audienceUserId === profileUserId)
	return profileTopicPosts
}

// the person whose profile it is, the signed-in reader, and the audience the reader reads it as, null for the visitor
// audience
type ReadProfilePageReadOptions = { profileUserId: string; sessionUserId: string | null; audienceUserId: string | null }

/**
 * Returns a profile's page read, or null if no person has that id. A read with no session is served from the profile's
 * copy, and so is a signed-in read of someone else's profile by anyone but an admin, with the reader's own news and
 * their own part beside it. The person's own read, an admin's, and a read in the visitor audience are built for the
 * reader and never stored.
 */
export async function readProfilePageRead({
	profileUserId,
	sessionUserId,
	audienceUserId,
}: ReadProfilePageReadOptions): Promise<ProfilePageRead | null> {
	if (!sessionUserId) {
		return readVisitorProfilePageRead(profileUserId)
	}

	// the visitor audience never fills the copy, and the person and an admin read the profile built for them
	if (!audienceUserId) {
		return buildProfilePageRead({ profileUserId, userId: null })
	}
	if ((await loadProfileReader(profileUserId, audienceUserId)) !== "visitor") {
		return buildProfilePageRead({ profileUserId, userId: audienceUserId })
	}

	// anyone else reads the visitors' copy with their own news and their own part
	const visitorPageRead = await readVisitorProfilePageRead(profileUserId)
	if (!visitorPageRead) {
		return null
	}
	const [news, userState] = await Promise.all([
		readPageReadNews({ profileUserId, userId: audienceUserId }),
		loadProfileUserState({ userId: audienceUserId, profile: visitorPageRead.profile }),
	])
	return { ...visitorPageRead, news, userState }
}

// a visitor's page read of a profile, from its copy, which a read whose news failed never fills
function readVisitorProfilePageRead(profileUserId: string): Promise<ProfilePageRead | null> {
	return readVisitorPage({
		key: toVisitorProfilePageKey(profileUserId),
		pageKind: "profile",
		load: () => buildProfilePageRead({ profileUserId, userId: null }),
		isShared: (profilePageRead) => profilePageRead !== null && profilePageRead.news !== null,
	})
}

// the reader, and the visitors' copy of the profile they read
type LoadProfileUserStateOptions = { userId: string; profile: ProfileResponse }

// the reader's own part of someone else's profile: whether they blocked the person, and the topics' part
async function loadProfileUserState({ userId, profile }: LoadProfileUserStateOptions): Promise<ProfileUserState> {
	const { blockedUserIds, userBlockUserIds } = await loadUserBlocksBetween(userId)
	const topicsUserState = await loadTopicsUserState({
		userId,
		isInUserBlock: userBlockUserIds.size > 0,
		topics: profile.topics,
		topicCards: profile.profileTopics,
	})
	return { ...topicsUserState, isBlocked: blockedUserIds.has(profile.userId) }
}

// the person whose profile it is, and the reader the profile is built for, null for a visitor
type BuildProfilePageReadOptions = { profileUserId: string; userId: string | null }

// build the profile and the news together, then the head from the profile. the news is null if its own read fails
async function buildProfilePageRead({
	profileUserId,
	userId,
}: BuildProfilePageReadOptions): Promise<ProfilePageRead | null> {
	const [profile, news] = await Promise.all([
		loadProfile(profileUserId, userId, { includesOwnTopics: true }),
		readPageReadNews({ profileUserId, userId }),
	])
	return profile ? { head: await loadProfilePageHeadFromProfile(profile), profile, news, userState: null } : null
}
