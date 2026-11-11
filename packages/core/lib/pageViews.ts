// keep the views of topic, profile, and team pages in memory for one web tab or native app runtime
import { sendProfileView, sendTeamView, sendTopicView } from "@carlnotes/client/viewerCountsClient"

// keep the pages this runtime has sent a view for, each as its kind and its id
const viewedPageKeys = new Set<string>()

/**
 * Sends the Topic page's view once per web tab or native app runtime.
 */
export function sendTopicViewOnce(topicId: string): void {
	sendViewOnce(`topic:${topicId}`, () => sendTopicView(topicId))
}

/**
 * Sends a profile page's view once per web tab or native app runtime.
 */
export function sendProfileViewOnce(userId: string): void {
	sendViewOnce(`profile:${userId}`, () => sendProfileView(userId))
}

/**
 * Sends a team page's view once per web tab or native app runtime.
 */
export function sendTeamViewOnce(teamId: string): void {
	sendViewOnce(`team:${teamId}`, () => sendTeamView(teamId))
}

// send the view of a page this runtime has not sent one for yet
function sendViewOnce(viewedPageKey: string, sendView: () => void): void {
	if (!viewedPageKeys.has(viewedPageKey)) {
		viewedPageKeys.add(viewedPageKey)
		sendView()
	}
}
