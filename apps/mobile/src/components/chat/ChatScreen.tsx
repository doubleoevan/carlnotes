import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { reloadChatRooms } from "@carlnotes/core/hooks/useUpdateBadges"
import { toChatKey, toPrivateChatPage } from "@carlnotes/core/lib/chatConversations"
import { setChatId } from "@carlnotes/core/stores/chatConversationStore"
import { useHasChatRoomsLoadFailed } from "@carlnotes/core/stores/chatRoomStore"
import { router } from "expo-router"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { ChatPanelWidget } from "./ChatPanelWidget"
import { ChatRoomPanel } from "./ChatRoomPanel"
import { PrivateChatPanel } from "./PrivateChatPanel"
import { type ChatPageState, type ChatScreenProps, useChatPage } from "./useChatPage"

/**
 * Opens the page's shared room first, keeping its private conversation one choice away.
 */
export function ChatScreen({ topicId, teamId, profileUserId, chatTeamId }: ChatScreenProps) {
	const chatPageState = useChatPage({ topicId, teamId, profileUserId, chatTeamId })
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
	// leave typing room at larger text sizes while retaining the conversation in its selector
	const isKeyboardVisible = useIsKeyboardVisible()
	// whether the chat rooms read failed
	const hasChatRoomsLoadFailed = useHasChatRoomsLoadFailed()
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
			<LoadFailedNotice
				className="p-3"
				message="Carl could not open this conversation."
				retryLabel="Retry conversation"
				onRetry={() => void chatPageQuery.refetch()}
			/>
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
				{!isKeyboardVisible && (
					<Text className="text-sm text-muted-foreground" numberOfLines={2}>
						{chatName}
					</Text>
				)}
				<ChoiceSelect
					label="Choose conversation"
					presentation="sheet"
					numberOfLines={isKeyboardVisible ? 1 : undefined}
					value={toChatKey(selectedChatId ?? null)}
					options={chatChoices.map((choice) => ({
						value: toChatKey(choice.id),
						label: choice.label,
						icon: choice.icon,
						badge: choice.badge,
					}))}
					onChange={(value) => setChatId(chatChoices.find((choice) => toChatKey(choice.id) === value)?.id ?? null)}
					onOpen={() => void reloadChatRooms()}
				/>
			</View>
			{/* failed conversations read */}
			{!selectedChatId && hasChatRoomsLoadFailed && (
				<LoadFailedNotice
					className="p-3"
					message="Your conversations didn't load."
					retryLabel="Retry loading conversations"
					onRetry={() => void reloadChatRooms()}
				/>
			)}
			{/* empty conversation */}
			{!selectedChatId && !hasChatRoomsLoadFailed && (
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
