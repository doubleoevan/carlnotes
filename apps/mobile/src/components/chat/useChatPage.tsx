import { ApiResponseError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { fetchProfile, fetchProfileTeamStatuses } from "@carlnotes/client/profileClient"
import { fetchTeamPage } from "@carlnotes/client/teamClient"
import { fetchTopicPage } from "@carlnotes/client/topicClient"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { reloadChatRooms } from "@carlnotes/core/hooks/useUpdateBadges"
import {
	type ChatId,
	type ChatPageContext,
	toChatKey,
	toChatRoomMenuOrder,
	toPrivateChatId,
	toPrivateChatName,
	toProfileChatContext,
} from "@carlnotes/core/lib/chatConversations"
import { activateChatAccount, setChatId, useChatConversation } from "@carlnotes/core/stores/chatConversationStore"
import { toChatRooms, useChatRooms } from "@carlnotes/core/stores/chatRoomStore"
import { type UseQueryResult, useQuery } from "@tanstack/react-query"
import { LockKeyhole } from "lucide-react-native"
import { type ComponentProps, useEffect } from "react"
import { Avatar } from "@/components/branding/Avatar"
import { HostAvatar } from "@/components/branding/HostAvatar"
import type { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { CountBadge } from "@/components/common/CountBadge"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { toInitialChatId } from "./chatNavigation"

// the page that opened the conversation, and the team whose chat room a badge named
export type ChatScreenProps = { topicId?: string; teamId?: string; profileUserId?: string; chatTeamId?: string }

// loaded page access, conversation choices, and the selected account
type ChatPageData = {
	pageContext: (ChatPageContext & { team?: TeamPageResponse }) | null
	isVisible: boolean
}
export type ChatChoice = { id: ChatId } & Pick<
	ComponentProps<typeof ChoiceSelect>["options"][number],
	"label" | "icon" | "badge"
>
export type ChatPageState = {
	query: UseQueryResult<ChatPageData, Error>
	session: ReturnType<ReturnType<typeof authClient>["useSession"]>["data"]
	accountId: string | null
	userId: string | undefined
	choices: ChatChoice[]
	selectedId: ChatId | undefined
	name: string
}

/**
 * Reads account-scoped page access before selecting the initial shared conversation.
 */
export function useChatPage({ topicId, teamId, profileUserId, chatTeamId }: ChatScreenProps): ChatPageState {
	// read access for this account, and the rooms into the shared store, before mounting a conversation
	const { data: session } = authClient().useSession()
	const { accountId, chatId } = useChatConversation()
	const { topicFeed } = useTopicFeed()
	const userId = session?.user.id
	const chatPageQuery = useQuery({
		queryKey: ["chat-page", userId, topicId, teamId, profileUserId],
		enabled: Boolean(userId),
		// share the page read within this open chat, then refresh membership on the next open
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 0,
		queryFn: async () => {
			const [pageContext] = await Promise.all([
				loadChatPageContext({ topicId, teamId, profileUserId, userId }),
				reloadChatRooms(),
			])
			return { pageContext, isVisible: pageContext !== null }
		},
	})

	// select the initial conversation once page access resolves, on the rooms the store holds then
	const chatRooms = useChatRooms()
	const isPageLoaded = chatPageQuery.data !== undefined
	const pageContext = chatPageQuery.data?.pageContext
	useEffect(() => {
		if (!isPageLoaded || !userId) {
			return
		}
		activateChatAccount(userId)
		setChatId(toInitialChatId({ rooms: toChatRooms(), topicId, teamId, chatTeamId, pageContext }))
		return () => setChatId(null)
	}, [isPageLoaded, userId, topicId, teamId, chatTeamId, pageContext])

	// retain page-specific private chat, or offer the selected room's Team conversation
	const privateChatId = toPrivateChatId(pageContext ?? null, chatId) ?? (chatId?.kind === "private" ? chatId : null)
	const topics = [
		...new Map(
			(topicFeed?.sections.flatMap((section) => section.topics) ?? []).map((topic) => [topic.id, topic]),
		).values(),
	]
	const hasTopicChoices = !topicId && !teamId && !chatRooms.length
	const chatChoices: ChatChoice[] = [
		...(privateChatId && !hasTopicChoices
			? [{ id: privateChatId, label: "Private chat", icon: <HostAvatar speaker="host" size={20} /> }]
			: []),
		...toChatRoomMenuOrder(chatRooms).map((chatRoom) => ({
			id: { kind: "room", topicId: chatRoom.topicId, teamId: chatRoom.teamId } as ChatId,
			label: chatRoom.topicId ? `${chatRoom.name} · ${chatRoom.teamName}` : chatRoom.teamName,
			// the room's unread chat mentions, as the web's room list counts them
			badge:
				chatRoom.chatMentions.length > 0 ? (
					<CountBadge count={chatRoom.chatMentions.length} className="text-xs" />
				) : undefined,
			icon: (
				<Avatar
					ownerId={chatRoom.teamId}
					name={chatRoom.teamName}
					size={20}
					imageUrl={
						chatRoom.teamAvatarVersion ? `/api/team-avatars/${chatRoom.teamId}?v=${chatRoom.teamAvatarVersion}` : null
					}
				/>
			),
		})),
		...(hasTopicChoices
			? topics.map((topic) => ({
					id: { kind: "private", topicId: topic.id } as ChatId,
					label: topic.name,
					icon: LockKeyhole,
				}))
			: []),
	]
	// resolve the selected conversation and its name
	const selectedChatId = chatChoices.find((choice) => toChatKey(choice.id) === toChatKey(chatId))?.id
	const selectedChatRoom = chatRooms.find(
		(chatRoom) =>
			selectedChatId?.kind === "room" &&
			chatRoom.teamId === selectedChatId.teamId &&
			chatRoom.topicId === selectedChatId.topicId,
	)
	const selectedTopic = topics.find((topic) => topic.id === selectedChatId?.topicId)
	const privateChatName =
		selectedChatId?.kind === "private" ? toPrivateChatName(selectedChatId, chatRooms, pageContext ?? null) : ""
	const chatName = selectedChatRoom?.name ?? selectedTopic?.name ?? privateChatName
	return {
		query: chatPageQuery,
		session,
		accountId,
		userId,
		choices: chatChoices,
		selectedId: selectedChatId,
		name: chatName,
	}
}

// read page access and the same profile preferences used by the web launcher
async function loadChatPageContext({
	topicId,
	teamId,
	profileUserId,
	userId,
}: ChatScreenProps & { userId?: string }): Promise<(ChatPageContext & { team?: TeamPageResponse }) | null> {
	const pageContext: ChatPageContext = { topicId: topicId ?? null, teamId: teamId ?? null, name: "", joinTeam: null }
	if (topicId) {
		// read Topic access and its name
		const topicPage = await fetchTopicPage(topicId)
		return topicPage.status === "visible" ? { ...pageContext, name: topicPage.topic.name } : null
	}
	if (teamId) {
		// read Team access and its members
		const teamPage = await fetchTeamPage(teamId)
		return teamPage.status === "visible" ? { ...pageContext, name: teamPage.team.name, team: teamPage.team } : null
	}
	if (!profileUserId) {
		return pageContext
	}

	// retain the web fallback if shared-team status is unavailable. a response that did not match its contract fails
	// the page
	const [profile, profileTeamStatuses] = await Promise.all([
		fetchProfile(profileUserId),
		fetchProfileTeamStatuses(profileUserId).catch((error: unknown) => {
			if (error instanceof ApiResponseError) {
				throw error
			}
			return []
		}),
	])
	return toProfileChatContext({ profile, profileTeamStatuses, isOwnProfile: profileUserId === userId })
}
