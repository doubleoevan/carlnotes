import { isModelChatMessage } from "@carlnotes/contracts/chatMentions"
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import type { ComponentType, ReactNode } from "react"

export type ChatAuthorElements = {
	Frame: ComponentType<{ children: ReactNode; isOwn?: boolean }>
	Row: ComponentType<{ children: ReactNode; isOwn?: boolean; userId: string | null }>
	Name: ComponentType<{ children: ReactNode; isLinked: boolean }>
	HostAvatar: ComponentType<{ speaker: PodcastEpisodeSpeaker }>
	UserAvatar: ComponentType<{ userId: string; username: string; avatarVersion: string | null; className: string }>
}
export type ChatAuthorProps = {
	authorUserId: string | null
	authorUsername: string
	avatarVersion?: string | null
	isOwnChatMessage?: boolean
	speaker?: PodcastEpisodeSpeaker
	children: ReactNode
}

/**
 * Keeps author identity, profile linking and alignment identical on both clients.
 */
export function ChatAuthor({
	authorUserId,
	authorUsername,
	avatarVersion,
	isOwnChatMessage,
	speaker,
	children,
	elements: { Frame, Row, Name, HostAvatar, UserAvatar },
}: ChatAuthorProps & { elements: ChatAuthorElements }) {
	const hostSpeaker = speaker ?? (isModelChatMessage({ authorUserId, authorUsername }) ? "host" : undefined)
	return (
		<Frame isOwn={isOwnChatMessage}>
			<Row userId={authorUserId} isOwn={isOwnChatMessage}>
				{hostSpeaker ? (
					<HostAvatar speaker={hostSpeaker} />
				) : (
					<UserAvatar
						userId={authorUserId ?? ""}
						username={authorUsername}
						avatarVersion={avatarVersion ?? null}
						className="size-6"
					/>
				)}
				<Name isLinked={authorUserId !== null}>{authorUsername}</Name>
			</Row>
			{children}
		</Frame>
	)
}
