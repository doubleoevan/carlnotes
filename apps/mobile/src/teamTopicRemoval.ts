import { sendRemoveTopicFromTeam } from "@carlnotes/client/teamClient"

// the line a team's topic shows if its remove fails
const TOPIC_NOT_REMOVED_LINE = "That topic didn't get removed."

/**
 * Removes a Topic from a team, throwing an error with the line a screen shows if the remove fails.
 */
export async function removeTopicFromTeam({ teamId, topicId }: { teamId: string; topicId: string }): Promise<void> {
	if (!(await sendRemoveTopicFromTeam(teamId, topicId))) {
		throw new Error(TOPIC_NOT_REMOVED_LINE)
	}
}
