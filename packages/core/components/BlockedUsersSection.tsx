import type { ComponentType, ReactNode } from "react"
import { type BlockedUsersList, useBlockedUsers } from "../hooks/useBlockedUsers"
import type { AccountFieldElements } from "./AccountFields"

// the section's words: its title, what a block does, the empty list, and the unblock control
export const BLOCKED_USERS_COPY = {
	title: "Blocked people",
	description: "Their messages, comments, and invitations no longer reach you. They are not told.",
	empty: "Nobody is blocked.",
	loading: "Reading the list…",
	failed: "Carl couldn't read the list.",
	retry: "Try again",
	unblock: "Unblock",
} as const

// the platform row for one blocked person, beside the account field elements the section shares
export type BlockedUsersElements = Pick<AccountFieldElements, "Card" | "Group" | "Heading" | "Text" | "Button"> & {
	Row: ComponentType<{ children: ReactNode }>
	Username: ComponentType<{ userId: string; username: string }>
}

/**
 * Lists the people the signed-in user has blocked, newest first, each with an Unblock control, on both platforms.
 */
export function BlockedUsersSection({ elements }: { elements: BlockedUsersElements }) {
	const blockedUsersList = useBlockedUsers()
	return <BlockedUsersCard elements={elements} blockedUsersList={blockedUsersList} />
}

/**
 * Renders the blocked people card from a loaded, loading, failed, or empty list.
 */
export function BlockedUsersCard({
	elements,
	blockedUsersList,
}: {
	elements: BlockedUsersElements
	blockedUsersList: BlockedUsersList
}) {
	const { Card, Group, Heading, Text, Button, Row, Username } = elements
	const { blockedUsers, isLoading, hasError, unblockingUserIds, retry, unblock } = blockedUsersList
	return (
		<Card>
			<Heading>{BLOCKED_USERS_COPY.title}</Heading>
			<Text className="text-muted-foreground mt-1 text-sm">{BLOCKED_USERS_COPY.description}</Text>
			{/* the list's loading, failed, and empty states */}
			{isLoading && <Text className="text-muted-foreground mt-3 text-sm">{BLOCKED_USERS_COPY.loading}</Text>}
			{hasError && (
				<Group>
					<Text className="text-destructive text-sm">{BLOCKED_USERS_COPY.failed}</Text>
					<Button label={BLOCKED_USERS_COPY.retry} onPress={retry} />
				</Group>
			)}
			{!isLoading && !hasError && blockedUsers.length === 0 && (
				<Text className="text-muted-foreground mt-3 text-sm">{BLOCKED_USERS_COPY.empty}</Text>
			)}
			{/* each blocked person with their unblock, which removes the row once the server accepts */}
			{blockedUsers.length > 0 && (
				<Group>
					{blockedUsers.map((blockedUser) => (
						<Row key={blockedUser.id}>
							<Username userId={blockedUser.id} username={blockedUser.username} />
							<Button
								label={BLOCKED_USERS_COPY.unblock}
								onPress={() => void unblock(blockedUser.id)}
								isDisabled={unblockingUserIds.has(blockedUser.id)}
							/>
						</Row>
					))}
				</Group>
			)}
		</Card>
	)
}
