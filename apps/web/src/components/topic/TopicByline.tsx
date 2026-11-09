// a topic's byline: the team or the owner of the topic
import type { TopicFeed } from "@carlnotes/contracts/topics"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { TeamLink } from "@/components/team/TeamLink"

// the team and the owner that a topic's byline chooses between, and the words before the name
type TopicBylineProps = { topic: Pick<TopicFeed, "teamLink" | "owner">; label?: string; className?: string }

/**
 * A topic's byline, which names the team for anyone who can open the team's page and the topic's owner otherwise.
 */
export function TopicByline({ topic, label = "Brewed by", className }: TopicBylineProps) {
	// name the team if there is a team link, and the owner otherwise
	if (topic.teamLink) {
		return <TeamLink team={topic.teamLink} label={label} className={className} />
	}
	return topic.owner ? <UserProfileLink user={topic.owner} label={label} className={className} /> : null
}
