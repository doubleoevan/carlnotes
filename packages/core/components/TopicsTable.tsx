import type { ProfileIdentity, Topic } from "@carlnotes/contracts/profiles"
import type { TeamIdentity } from "@carlnotes/contracts/teamIdentity"
import type { ComponentType, ReactNode } from "react"
import { useTopicEmails } from "../hooks/useTopicEmails"
import { toTopicsTableColumns } from "../lib/topicsTableColumns"
import type { TableColumn } from "./DataTable"

export type TopicsTableElements = {
	// the sorted, paginated table around the columns, with the error line under it
	Table: ComponentType<{ topics: Topic[]; columns: TableColumn<Topic>[]; className?: string; children?: ReactNode }>
	Text: ComponentType<{ children: string }>
	ErrorText: ComponentType<{ children: string }>
	NameLink: ComponentType<{ topic: Topic }>
	// the Owner column's links on a profile: the topic's team, or else its owner
	TeamLink: ComponentType<{ team: TeamIdentity }>
	UserProfileLink: ComponentType<{ user: ProfileIdentity }>
	Visibility: ComponentType<{ visibility: Topic["visibility"] }>
	// the kept-over-seen cell, which opens the topic's info
	TopicInfo: ComponentType<{ topic: Topic }>
	Switch: ComponentType<{ label: string; isChecked: boolean; isDisabled?: boolean; onChange: (isOn: boolean) => void }>
	RemoveButton: ComponentType<{ label: string; onPress: () => void }>
}

/**
 * Renders a profile's or a team's topics with their dates, followers, kept findings, and email switches, on a profile
 * each one's team or owner, and on a team the active switch and the remove button.
 */
export function TopicsTable({
	topics,
	includesNonPublicTopics,
	isOwnerShown = false,
	topicTooltip,
	onRemoveTopic,
	className,
	elements: {
		Table,
		Text,
		ErrorText,
		NameLink,
		TeamLink,
		UserProfileLink,
		Visibility,
		TopicInfo,
		Switch,
		RemoveButton,
	},
}: {
	topics: Topic[]
	includesNonPublicTopics: boolean
	// a profile's table names each topic's team or owner
	isOwnerShown?: boolean
	topicTooltip?: string
	// a team leader's remove, which the app confirms before calling
	onRemoveTopic?: (topic: Topic) => void
	// the table card's classes on the web, such as a team row's subtable
	className?: string
	elements: TopicsTableElements
}) {
	// the email switches, each saved as it flips
	const topicEmails = useTopicEmails()
	const columns = toTopicsTableColumns({
		topics,
		includesNonPublicTopics,
		topicTooltip,
		renderText: (text) => <Text>{text}</Text>,
		renderName: (topic) => <NameLink topic={topic} />,
		renderOwner: isOwnerShown
			? (topic) => (topic.team ? <TeamLink team={topic.team} /> : <UserProfileLink user={topic.owner} />)
			: undefined,
		renderVisibility: (topic) => <Visibility visibility={topic.visibility} />,
		renderInfo: (topic) => <TopicInfo topic={topic} />,
		renderEmail: (topic) => (
			<Switch
				label={`Email me ${topic.name}`}
				isChecked={topicEmails.choices[topic.id] ?? topic.isEmailEnabled ?? false}
				isDisabled={topicEmails.pending[topic.id]}
				onChange={(isEnabled) => void topicEmails.setEmail(topic.id, isEnabled)}
			/>
		),
		renderActive: onRemoveTopic
			? (topic) => <Switch label={`Deactivate ${topic.name}`} isChecked onChange={() => onRemoveTopic(topic)} />
			: undefined,
		renderRemove: onRemoveTopic
			? (topic) => <RemoveButton label={`Remove ${topic.name} from the team`} onPress={() => onRemoveTopic(topic)} />
			: undefined,
	})

	// an empty list renders nothing
	if (topics.length === 0) {
		return null
	}
	return (
		<Table topics={topics} columns={columns} className={className}>
			{topicEmails.error && <ErrorText>{topicEmails.error}</ErrorText>}
		</Table>
	)
}
