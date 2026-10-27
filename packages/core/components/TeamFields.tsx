import { CHAT_NAME } from "@carlnotes/contracts/chat"
import type { ComponentType, ReactNode } from "react"

type Container = ComponentType<{ children: ReactNode }>
export type TeamFieldElements = {
	Group: Container
	InvitationGroup: Container
	Text: Container
	Field: ComponentType<{
		label: string
		value: string
		onChange: (value: string) => void
		placeholder: string
		isRequired?: boolean
		isMultiline?: boolean
		onBlur?: () => void
		hasError?: boolean
	}>
	PublicChoice: ComponentType<{ isPublic: boolean; onChange: (isPublic: boolean) => void }>
}

/**
 * Renders the same team editor fields and explanatory copy on web and mobile.
 */
export function TeamFields({
	elements: { Group, InvitationGroup, Text, Field, PublicChoice },
	isNew,
	name,
	description,
	isPublic,
	onNameChange,
	onDescriptionChange,
	onPublicChange,
	onNameBlur,
	hasNameError,
	avatar,
	topics,
	invitations,
}: {
	elements: TeamFieldElements
	isNew: boolean
	name: string
	description: string
	isPublic: boolean
	onNameChange: (name: string) => void
	onDescriptionChange: (description: string) => void
	onPublicChange: (isPublic: boolean) => void
	onNameBlur?: () => void
	hasNameError?: boolean
	avatar: ReactNode
	topics: ReactNode
	invitations: ReactNode
}) {
	return (
		<>
			{/* identity and reading focus precede the team's membership controls */}
			{isNew && <Text>{`A team shares its topics and a ${CHAT_NAME} group with Carl.`}</Text>}
			{avatar}
			<Group>
				<Field
					label="Name"
					value={name}
					onChange={onNameChange}
					placeholder="what to call it…"
					isRequired
					onBlur={onNameBlur}
					hasError={hasNameError}
				/>
			</Group>
			<Group>
				<Field
					label="Description"
					value={description}
					onChange={onDescriptionChange}
					placeholder="what the team reads about…"
					isMultiline
				/>
			</Group>
			{topics}
			<InvitationGroup>
				{invitations}
				<PublicChoice isPublic={isPublic} onChange={onPublicChange} />
			</InvitationGroup>
		</>
	)
}
