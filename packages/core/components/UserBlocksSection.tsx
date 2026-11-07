import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type { UserBlock } from "@carlnotes/contracts/userBlocks"
import { type ComponentType, type ReactNode, useState } from "react"
import { type UserBlocksList, useUserBlocks } from "../hooks/useUserBlocks"
import type { ConfirmationCopy } from "../lib/confirmationCopy"
import type { ConfirmElementProps } from "../lib/confirmElement"
import type { AccountFieldElements } from "./AccountFields"

// the section's words: its title, what a user block does, the empty list, and the unblock control
const USER_BLOCKS_COPY = {
	title: "Blocked people",
	description: "Their messages, comments, and invitations no longer reach you. They are not told.",
	empty: "Nobody is blocked.",
	loading: "Reading the list…",
	failed: "Carl couldn't read the list.",
	retry: "Try again",
	unblock: "Unblock",
} as const

// unblocking a person
function toUnblockConfirmation(username: string): ConfirmationCopy {
	return {
		title: `Unblock ${username}?`,
		children: "Their messages, comments, and invitations can reach you again. They are not told.",
		confirmLabel: USER_BLOCKS_COPY.unblock,
		cancelLabel: "Cancel",
	}
}

// the platform row and confirmation for one blocked person, beside the account field elements the section shares
export type UserBlocksElements = Pick<AccountFieldElements, "Card" | "Group" | "Heading" | "Text" | "Button"> & {
	Row: ComponentType<{ children: ReactNode }>
	UserLink: ComponentType<{ user: ProfileIdentity }>
	Confirm: ComponentType<ConfirmElementProps>
}

/**
 * Lists the people the signed-in user has blocked, newest first, each with a confirmed Unblock, on both platforms.
 */
export function UserBlocksSection({ elements }: { elements: UserBlocksElements }) {
	const userBlocksList = useUserBlocks()
	return <UserBlocksCard elements={elements} userBlocksList={userBlocksList} />
}

/**
 * Renders the blocked people card from a loaded, loading, failed, or empty list.
 */
export function UserBlocksCard({
	elements,
	userBlocksList,
}: {
	elements: UserBlocksElements
	userBlocksList: UserBlocksList
}) {
	const { Card, Group, Heading, Text, Button, Row, UserLink, Confirm } = elements
	const { userBlocks, isLoading, hasError, unblockingUserIds, retry, unblock } = userBlocksList
	const [userToUnblock, setUserToUnblock] = useState<UserBlock | null>(null)

	// unblock the confirmed person, then close the dialog
	const handleConfirmUnblock = async (): Promise<void> => {
		if (userToUnblock) {
			await unblock(userToUnblock.id)
		}
		setUserToUnblock(null)
	}

	return (
		<Card>
			<Heading>{USER_BLOCKS_COPY.title}</Heading>
			<Text className="text-muted-foreground mt-1 text-sm">{USER_BLOCKS_COPY.description}</Text>
			{/* the list's loading, failed, and empty states */}
			{isLoading && <Text className="text-muted-foreground mt-3 text-sm">{USER_BLOCKS_COPY.loading}</Text>}
			{hasError && (
				<Group>
					<Text className="text-destructive text-sm">{USER_BLOCKS_COPY.failed}</Text>
					<Button label={USER_BLOCKS_COPY.retry} onPress={retry} />
				</Group>
			)}
			{!isLoading && !hasError && userBlocks.length === 0 && (
				<Text className="text-muted-foreground mt-3 text-sm">{USER_BLOCKS_COPY.empty}</Text>
			)}
			{/* each blocked person with their unblock, which removes the row once the user confirms and the server accepts */}
			{userBlocks.length > 0 && (
				<Group>
					{userBlocks.map((userBlock) => (
						<Row key={userBlock.id}>
							<UserLink user={{ ...userBlock, userId: userBlock.id }} />
							<Button
								label={USER_BLOCKS_COPY.unblock}
								onPress={() => setUserToUnblock(userBlock)}
								isDisabled={unblockingUserIds.has(userBlock.id)}
							/>
						</Row>
					))}
				</Group>
			)}
			{userToUnblock && (
				<Confirm
					{...toUnblockConfirmation(userToUnblock.username)}
					onConfirm={handleConfirmUnblock}
					onClose={() => setUserToUnblock(null)}
				/>
			)}
		</Card>
	)
}
