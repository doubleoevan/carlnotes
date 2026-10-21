// the podcast episode page smoke sections: the gate of an invite topic's episode page, the 404 of a private topic's,
// the sitemap, the topic gates, the link-preview card, and a public topic's episode page
import { toSitemapXml } from "../seo"
import { loadTopicGateResponse } from "../topic/helpers"
import {
	chapterSourceHost,
	check,
	findingId,
	invitePodcastEpisodeId,
	inviteTopicId,
	ownerId,
	paidOwnerId,
	privatePodcastEpisodeId,
	privateTopicId,
	publicPodcastEpisodeId,
	publicTopicId,
	request,
	runId,
	subscriberId,
} from "./podcastEpisodeSmokeFixtures"

/**
 * Checks the gate of an invite topic's episode page, the 404 of a private topic's, the sitemap, and the topic gates.
 */
export async function checkGatedPodcastEpisodePages(): Promise<void> {
	// an invite topic's podcast episode page shows a visitor the topic's gate, and the sitemap never lists the episode.
	// the topic's owner still opens the page
	check(
		"the sitemap lists nothing of the invite topic",
		!(await toSitemapXml("https://carlnotes.example.com")).includes(inviteTopicId),
	)
	const invitePodcastEpisodePath = `/topics/${inviteTopicId}/episodes/2026/1`
	const visitorInvitePodcastEpisodeResponse = await request({ path: invitePodcastEpisodePath, userId: null })
	const visitorInvitePodcastEpisodeBody = await visitorInvitePodcastEpisodeResponse.json()
	check(
		"an invite topic's episode page is gated for a visitor, naming the topic",
		visitorInvitePodcastEpisodeResponse.status === 403 &&
			visitorInvitePodcastEpisodeBody.gatedVisibility === "invite" &&
			typeof visitorInvitePodcastEpisodeBody.topicName === "string",
		visitorInvitePodcastEpisodeBody,
	)
	const ownerInvitePodcastEpisodePage = await (
		await request({ path: invitePodcastEpisodePath, userId: ownerId })
	).json()
	check(
		"an invite topic's episode page opens for its owner and names the topic's visibility",
		ownerInvitePodcastEpisodePage.podcastEpisode?.id === invitePodcastEpisodeId &&
			ownerInvitePodcastEpisodePage.topic?.visibility === "invite",
	)

	// a private topic's podcast episode page does not exist for a visitor or a signed-in non-member. the topic's owner
	// still opens the page, and the sitemap never lists the episode
	const privatePodcastEpisodePath = `/topics/${privateTopicId}/episodes/2026/1`
	const gatedUsers = [
		{ gatedUserLabel: "a visitor", gatedUserId: null },
		{ gatedUserLabel: "a signed-in non-member", gatedUserId: subscriberId },
	]
	for (const { gatedUserLabel, gatedUserId } of gatedUsers) {
		// the 404 that the user gets, with no gate body
		const privateNotFoundResponse = await request({ path: privatePodcastEpisodePath, userId: gatedUserId })
		const privateNotFoundBody = await privateNotFoundResponse.json()
		check(
			`a private topic's episode page does not exist for ${gatedUserLabel}`,
			privateNotFoundResponse.status === 404 && privateNotFoundBody.gatedVisibility === undefined,
			privateNotFoundBody,
		)
	}
	check(
		"a private topic's episode page opens for its owner",
		(await request({ path: privatePodcastEpisodePath, userId: paidOwnerId })).status === 200,
	)
	check(
		"the sitemap lists nothing of the private topic",
		!(await toSitemapXml("https://carlnotes.example.com")).includes(privateTopicId),
	)

	// the topic page's gate names an invite topic, and a private or public topic has no gate
	check("a private topic has no gate", (await loadTopicGateResponse(privateTopicId)) === null)
	const inviteTopicGateResponse = await loadTopicGateResponse(inviteTopicId)
	check(
		"an invite topic's gate names the topic",
		inviteTopicGateResponse?.gatedVisibility === "invite" && inviteTopicGateResponse.topicName === `${runId} invite`,
		inviteTopicGateResponse,
	)
	check("a public topic has no gate", (await loadTopicGateResponse(publicTopicId)) === null)
}

/**
 * Checks a private topic's episode card, and a public topic's episode page with its chapter and finding.
 */
export async function checkPublicPodcastEpisodePage(): Promise<void> {
	// a private topic's podcast episode has its link-preview card, served without a session
	const privatePreviewResponse = await request({
		path: `/episodes/${privatePodcastEpisodeId}/preview.png`,
		userId: null,
	})
	check(
		"a private topic's episode card loads without a session",
		privatePreviewResponse.status === 200 && privatePreviewResponse.headers.get("Content-Type") === "image/png",
	)
	const publicPodcastEpisodePage = await (
		await request({ path: `/topics/${publicTopicId}/episodes/2026/1`, userId: null })
	).json()
	check(
		"a public topic's episode page has the episode and its topic",
		publicPodcastEpisodePage.podcastEpisode?.id === publicPodcastEpisodeId &&
			publicPodcastEpisodePage.topic?.id === publicTopicId,
	)
	check(
		"the episode page's byline credits the topic's owner",
		publicPodcastEpisodePage.topic?.owner?.userId === ownerId && publicPodcastEpisodePage.topic?.teamLink === null,
	)
	check(
		"the episode page's chapter names its source's stored favicon",
		publicPodcastEpisodePage.podcastEpisode?.chapters[0]?.faviconPath === `/api/favicons/${chapterSourceHost}`,
	)
	check(
		"the episode page has the finding that its chapter narrates, which a visitor may not rate",
		publicPodcastEpisodePage.topicFindings?.[0]?.findingId === findingId && publicPodcastEpisodePage.canRate === false,
	)
}
