// a team's page read: the team page with its head, served to visitors from one copy per team, and to a signed-in
// non-member of a public team who asks for it from that copy with their own part beside it
import type { TeamUserState } from "@carlnotes/contracts/pageUserStates"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import { readVisitorPage, toVisitorTeamPageKey } from "@carlnotes/db/visitorPageCaches"
import { loadTeamChatMentions } from "../chat/mentions"
import { toTeamPageHeadFromPage } from "../share/pageHead"
import { loadTopicsUserState } from "../topic/topicsUserState"
import { overlayUncheckedTeamAvatar } from "../uncheckedImageOverlays"
import { loadUserBlocksBetween } from "../userBlocks"
import { loadTeamPage, type TeamPageResult } from "./teamPage"
import { loadTeamPageAccess, type TeamPageAccess } from "./teamPageAccess"

// the user, null for a visitor, the team, and whether the read asks for the visitors' copy with the user's own part
type ReadTeamPageReadOptions = { userId: string | null; teamId: string; isUserStateAsked?: boolean }

/**
 * Returns a team's page read with its head: the whole page, the gate a private team shows a non-member, or no team at
 * all. A visitor's read of a page they may open is served from the team's copy, and so is the read of a signed-in
 * non-member of a public team with no pending invite who asks for it, with their own part beside it. Any other user's
 * read is built for them, with a leader's unchecked avatar, and never stored.
 */
export async function readTeamPageRead({
	userId,
	teamId,
	isUserStateAsked = false,
}: ReadTeamPageReadOptions): Promise<TeamPageResult> {
	if (!userId) {
		return readVisitorTeamPageRead(teamId)
	}

	// a member, an invitee, and a reader of a private team read the page built for them, and so does a read that asks
	// for no shared copy
	const teamPageAccess = await loadTeamPageAccess(userId, teamId)
	if (!teamPageAccess) {
		return { status: "missing" }
	}

	// the page built for the reader, with a leader's unchecked avatar
	if (!isUserStateAsked || !isSharedCopyReader(teamPageAccess)) {
		const teamPageResult = await buildTeamPageRead({ userId, teamId, teamPageAccess })
		return teamPageResult.status === "visible"
			? { status: "visible", team: await overlayUncheckedTeamAvatar(teamPageResult.team, userId) }
			: teamPageResult
	}

	// anyone else reads the visitors' copy with their own part
	const visitorPageRead = await readVisitorTeamPageRead(teamId)
	if (visitorPageRead.status !== "visible") {
		return visitorPageRead
	}
	const userState = await loadTeamUserState({ userId, team: visitorPageRead.team, teamPageAccess })
	return { status: "visible", team: { ...visitorPageRead.team, userState } }
}

/**
 * Returns a team's Topic Post cards as the reader may see them, or null for a team they may not open. A visitor and a
 * non-member of a public team with no pending invite read them from the team's copy.
 */
export async function readTeamTopicPostCards(userId: string | null, teamId: string): Promise<TopicPostCard[] | null> {
	if (!userId) {
		return toTopicPostCardsOfVisiblePage(await readVisitorTeamPageRead(teamId))
	}

	// a team the reader may not open has no posts for them
	const teamPageAccess = await loadTeamPageAccess(userId, teamId)
	if (!teamPageAccess) {
		return null
	}

	// a non-member of a public team reads the copy, and a member and an invitee read the page built for them
	// ponytail: builds the whole team page for one page of its posts. members are few. read the posts alone if that grows
	return toTopicPostCardsOfVisiblePage(
		isSharedCopyReader(teamPageAccess)
			? await readVisitorTeamPageRead(teamId)
			: await buildTeamPageRead({ userId, teamId, teamPageAccess }),
	)
}

// the Topic Post cards of a team page the reader may see, or null for a gated or missing team
function toTopicPostCardsOfVisiblePage(teamPageResult: TeamPageResult): TopicPostCard[] | null {
	return teamPageResult.status === "visible" ? teamPageResult.team.topicPostCards : null
}

// whether the user reads a public team's page as a visitor does: no member and no invitee
function isSharedCopyReader(teamPageAccess: TeamPageAccess): boolean {
	return teamPageAccess.team.isPublic && !teamPageAccess.role && !teamPageAccess.isInvited
}

// a visitor's read of a team's page, from the team's copy, which only a page a visitor may open fills
function readVisitorTeamPageRead(teamId: string): Promise<TeamPageResult> {
	return readVisitorPage({
		key: toVisitorTeamPageKey(teamId),
		pageKind: "team",
		load: () => buildTeamPageRead({ userId: null, teamId }),
		isShared: (teamPageResult) => teamPageResult.status === "visible",
	})
}

// the user, the visitors' copy of the team page, and what the user is to the team
type LoadTeamUserStateOptions = { userId: string; team: TeamPageResponse; teamPageAccess: TeamPageAccess }

// the user's own part of a team page they are not a member of: their join request, their unseen chat mentions, and the
// topics' part
async function loadTeamUserState({ userId, team, teamPageAccess }: LoadTeamUserStateOptions): Promise<TeamUserState> {
	const [{ userBlockUserIds }, chatMentionsByTeam] = await Promise.all([
		loadUserBlocksBetween(userId),
		loadTeamChatMentions(userId, [team.teamId]),
	])
	const topicsUserState = await loadTopicsUserState({
		userId,
		isInUserBlock: userBlockUserIds.size > 0,
		topics: team.topics,
		topicCards: team.topicCards,
	})
	return {
		...topicsUserState,
		hasRequestedToJoin: teamPageAccess.hasRequestedToJoin,
		chatMentions: chatMentionsByTeam.get(team.teamId) ?? [],
	}
}

// the reader, null for a visitor, the team, and what the reader is to it if it is already loaded
type BuildTeamPageReadOptions = { userId: string | null; teamId: string; teamPageAccess?: TeamPageAccess }

// build the page, then a public team's head from the team's row and the page
async function buildTeamPageRead({
	userId,
	teamId,
	teamPageAccess,
}: BuildTeamPageReadOptions): Promise<TeamPageResult> {
	// what the reader is to the team, read here unless the caller already did
	const loadedTeamPageAccess = teamPageAccess ?? (await loadTeamPageAccess(userId, teamId))
	if (!loadedTeamPageAccess) {
		return { status: "missing" }
	}

	// the page, and the head only a public team's visible page includes
	const teamPageResult = await loadTeamPage(userId, teamId, loadedTeamPageAccess)
	const { team } = loadedTeamPageAccess
	if (teamPageResult.status !== "visible" || !team.isPublic) {
		return teamPageResult
	}
	return {
		status: "visible",
		team: { ...teamPageResult.team, head: toTeamPageHeadFromPage(team, teamPageResult.team) },
	}
}
