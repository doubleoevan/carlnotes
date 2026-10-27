import { authClient } from "@carlnotes/client/authClient"
import { fetchChatRooms } from "@carlnotes/client/chatRoomClient"
import { fetchProfile, fetchProfileTeamStatuses } from "@carlnotes/client/profileClient"
import { fetchTeamPage } from "@carlnotes/client/teamClient"
import { fetchTopicPage } from "@carlnotes/client/topicClient"
import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import { isAdminRole } from "@carlnotes/contracts/enums"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import {
	type ChatId,
	type ChatPageContext,
	toChatKey,
	toChatRoomMenuOrder,
	toPrivateChatId,
	toPrivateChatName,
	toPrivateChatPage,
	toProfileChatContext,
} from "@carlnotes/core/lib/chatConversations"
import { activateChatAccount, setChatId, useChatConversation } from "@carlnotes/core/stores/chatConversationStore"
import { type UseQueryResult, useQuery } from "@tanstack/react-query"
import { router } from "expo-router"
import { LockKeyhole } from "lucide-react-native"
import { type ComponentProps, useEffect } from "react"
import { View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { HostAvatar } from "@/components/branding/HostAvatar"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { ChatPanelWidget } from "./ChatPanelWidget"
import { ChatRoomPanel } from "./ChatRoomPanel"
import { toInitialChatId } from "./chatNavigation"
import { PrivateChatPanel } from "./PrivateChatPanel"

// the page that opened the conversation
type ChatScreenProps = { topicId?: string; teamId?: string; profileUserId?: string }

// loaded page access, conversation choices, and the selected account
type ChatPageData = {
	pageContext: (ChatPageContext & { team?: TeamPageResponse }) | null
	rooms: Awaited<ReturnType<typeof fetchChatRooms>>
	isVisible: boolean
}
type ChatPageState = {
	query: UseQueryResult<ChatPageData, Error>
	session: ReturnType<ReturnType<typeof authClient>["useSession"]>["data"]
	accountId: string | null
	userId: string | undefined
	choices: { id: ChatId; label: string; icon: ComponentProps<typeof ChoiceSelect>["options"][number]["icon"] }[]
	selectedId: ChatId | undefined
	name: string
}

/**
 * Opens the page's shared room first, keeping its private conversation one choice away.
 */
export function ChatScreen({ topicId, teamId, profileUserId }: ChatScreenProps) {
	const chatPageState = useChatPage({ topicId, teamId, profileUserId })
	// return to the originating screen with its list position intact
	const handleClose = (): void => {
		if (router.canGoBack()) {
			router.back()
			return
		}
		if (topicId) {
			router.replace(`/topics/${topicId}`)
			return
		}
		router.replace(teamId ? `/teams/${teamId}` : "/")
	}
	return (
		<ChatPanelWidget onClose={handleClose}>
			<ChatScreenContent state={chatPageState} />
		</ChatPanelWidget>
	)
}

// keep loading and access gates outside the mounted conversation state
function ChatScreenContent({ state: chatPageState }: { state: ChatPageState }) {
	const {
		query: chatPageQuery,
		session,
		accountId,
		userId,
		choices: chatChoices,
		selectedId: selectedChatId,
		name: chatName,
	} = chatPageState
	if (chatPageQuery.isError) {
		return (
			<View className="gap-3 p-3">
				<Text>Carl could not open this conversation.</Text>
				<Button accessibilityLabel="Retry Coffee Talk" onPress={() => void chatPageQuery.refetch()}>
					<Text>Try again</Text>
				</Button>
			</View>
		)
	}
	if (chatPageQuery.isPending || accountId !== userId) {
		return <CoffeeLoading />
	}
	if (!chatPageQuery.data.isVisible) {
		return <Text className="p-3 text-muted-foreground">This conversation is unavailable.</Text>
	}
	return (
		<>
			{/* conversation selector */}
			<View className="gap-2 px-3 pb-2">
				<Text className="text-sm text-muted-foreground" numberOfLines={2}>
					{chatName}
				</Text>
				<ChoiceSelect
					label="Choose conversation"
					presentation="sheet"
					value={toChatKey(selectedChatId ?? null)}
					options={chatChoices.map((choice) => ({
						value: toChatKey(choice.id),
						label: choice.label,
						icon: choice.icon,
					}))}
					onChange={(value) => setChatId(chatChoices.find((choice) => toChatKey(choice.id) === value)?.id ?? null)}
				/>
			</View>
			{/* empty conversation */}
			{!selectedChatId && (
				<View className="gap-3 p-3">
					<Text className="text-sm text-muted-foreground">
						{chatChoices.length
							? "Choose a topic to talk with Carl."
							: "Open a topic to start a conversation with Carl."}
					</Text>
					{!chatChoices.length && (
						<Button accessibilityLabel="Browse topics" onPress={() => router.replace("/")}>
							<Text>Browse topics</Text>
						</Button>
					)}
				</View>
			)}
			{/* selected conversation */}
			{selectedChatId &&
				session &&
				(selectedChatId.kind === "room" ? (
					<ChatRoomPanel
						key={`${userId}:${toChatKey(selectedChatId)}`}
						topicId={selectedChatId.topicId}
						teamId={selectedChatId.teamId}
						loadedTeam={chatPageQuery.data.pageContext?.team}
						userId={session.user.id}
						name={chatName}
						isAdmin={isAdminRole(session.user.role)}
					/>
				) : (
					<PrivateChatPanel
						key={`${userId}:${toChatKey(selectedChatId)}`}
						page={toPrivateChatPage(selectedChatId)}
						name={chatName}
						author={{
							userId: session.user.id,
							username: session.user.username ?? session.user.name,
							avatarVersion: toAvatarVersion(session.user),
						}}
					/>
				))}
		</>
	)
}

// read account-scoped page access before selecting the initial shared conversation
function useChatPage({ topicId, teamId, profileUserId }: ChatScreenProps): ChatPageState {
	// read access and room choices for this account before mounting a conversation
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
			const [pageContext, chatRooms] = await Promise.all([
				loadChatPageContext({ topicId, teamId, profileUserId, userId }),
				fetchChatRooms(),
			])
			return { pageContext, rooms: chatRooms, isVisible: pageContext !== null }
		},
	})
	// select the initial conversation after page access resolves
	const chatRooms = chatPageQuery.data?.rooms
	const pageContext = chatPageQuery.data?.pageContext
	useEffect(() => {
		if (!chatRooms || !userId) {
			return
		}
		activateChatAccount(userId)
		setChatId(toInitialChatId({ rooms: chatRooms, topicId, teamId, pageContext }))
		return () => setChatId(null)
	}, [chatRooms, userId, topicId, teamId, pageContext])

	// retain page-specific private chat, or offer the selected room's Team conversation
	const privateChatId = toPrivateChatId(pageContext ?? null, chatId) ?? (chatId?.kind === "private" ? chatId : null)
	const topics = [
		...new Map(
			(topicFeed?.sections.flatMap((section) => section.topics) ?? []).map((topic) => [topic.id, topic]),
		).values(),
	]
	const hasTopicChoices = !topicId && !teamId && !chatRooms?.length
	const chatChoices = [
		...(privateChatId && !hasTopicChoices
			? [{ id: privateChatId, label: "Private chat", icon: <HostAvatar speaker="host" size={20} /> }]
			: []),
		...toChatRoomMenuOrder(chatRooms ?? []).map((chatRoom) => ({
			id: { kind: "room", topicId: chatRoom.topicId, teamId: chatRoom.teamId } as ChatId,
			label: chatRoom.topicId ? `${chatRoom.name} · ${chatRoom.teamName}` : chatRoom.teamName,
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
	const selectedChatRoom = chatRooms?.find(
		(chatRoom) =>
			selectedChatId?.kind === "room" &&
			chatRoom.teamId === selectedChatId.teamId &&
			chatRoom.topicId === selectedChatId.topicId,
	)
	const selectedTopic = topics.find((topic) => topic.id === selectedChatId?.topicId)
	const privateChatName =
		selectedChatId?.kind === "private" ? toPrivateChatName(selectedChatId, chatRooms ?? [], pageContext ?? null) : ""
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

	// retain the web fallback when shared-team status is unavailable
	const [profile, profileTeamStatuses] = await Promise.all([
		fetchProfile(profileUserId),
		fetchProfileTeamStatuses(profileUserId).catch(() => []),
	])
	return toProfileChatContext({ profile, profileTeamStatuses, isOwnProfile: profileUserId === userId })
}
