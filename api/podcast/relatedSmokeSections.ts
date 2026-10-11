// the related smoke section: the topic page's related topics and the episode page's two tables, each checked against
// the view rules for a visitor, the owner, a team member, a subscriber, and a user with no access, the status filters,
// the score's limit, and the shared tag bonus, and last the vector flags of a topic made private
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { topics } from "../../db/schema/topics"
import { podcastEpisodeVectors } from "../../db/schema/vectors"
import { saveTopicVectors } from "../../worker"
import { loadTopicPage } from "../topic/topics"
import { check, ownerId, paidOwnerId, request, runId, subscriberId } from "./podcastEpisodeSmokeFixtures"
import { deleteRelatedFixtures, relatedTopicIds, seedRelatedFixtures, teamMemberId } from "./relatedSmokeFixtures"

/**
 * Seeds the related fixtures, checks the topic page's related topics, the episode page's two tables, and the flags of a
 * topic made private, and deletes the fixtures' resources, team, and team member. The owner's delete in the smoke's
 * cleanup cascades to the rest.
 */
export async function checkRelatedTopicsAndPodcastEpisodes(): Promise<void> {
	// seed, then check, and delete what the owner's delete does not reach however the checks end
	await seedRelatedFixtures()
	try {
		await checkRelatedTopics()
		await checkPodcastEpisodeTables()
		await checkTopicMadePrivateFlags()
	} finally {
		// the resources, the team, and the team member
		await deleteRelatedFixtures()
	}
}

// the page's related topics for a visitor: the near, the farther, and the tagged public shown topics in that order, the
// near one with its play button and the farther one without, and neither the far topic nor any of the hidden three.
// then each signed-in user's related topics, and the private topic's own page
async function checkRelatedTopics(): Promise<void> {
	// the fixtures among the page's related topics for a visitor. the dev database's own topics may rank among them
	const visitorTopicPage = await loadTopicPage(null, relatedTopicIds.page)
	const visitorRelatedFixtureTopics = (visitorTopicPage?.relatedTopics ?? []).filter((relatedTopic) =>
		relatedTopic.id.startsWith(runId),
	)
	const relatedFixtureTopicIds = visitorRelatedFixtureTopics.map((relatedTopic) => relatedTopic.id)
	check(
		"related topics lists the near topic, the farther one, and the tagged one, and not the far one or the hidden three",
		relatedFixtureTopicIds.join() === [relatedTopicIds.near, relatedTopicIds.noEpisode, relatedTopicIds.tagged].join(),
		relatedFixtureTopicIds,
	)
	check(
		"a related topic's play button is its latest published episode, and a topic without one has none",
		visitorRelatedFixtureTopics[0]?.latestPodcastEpisode?.id === `${relatedTopicIds.near}-episode-1` &&
			visitorRelatedFixtureTopics[1]?.latestPodcastEpisode === null,
	)

	// the owner also sees the three hidden topics, which share the page's vector and rank first
	const hiddenTopicIds = [relatedTopicIds.publicNotShown, relatedTopicIds.invite, relatedTopicIds.private]
	const ownerRelatedTopicIds = await loadRelatedFixtureTopicIds(relatedTopicIds.page, ownerId)
	check(
		"the owner's related topics lead with the three hidden topics they own, then the visitor's three",
		ownerRelatedTopicIds.slice(0, 3).sort().join() === hiddenTopicIds.toSorted().join() &&
			ownerRelatedTopicIds.slice(3).join() === relatedFixtureTopicIds.join(),
		ownerRelatedTopicIds,
	)

	// the subscriber also sees the invite topic they subscribe to, the team member the private topic their team holds,
	// and a user with no access sees what a visitor sees
	const subscriberRelatedTopicIds = await loadRelatedFixtureTopicIds(relatedTopicIds.page, subscriberId)
	check(
		"the subscriber's related topics add the invite topic they subscribe to and nothing else hidden",
		subscriberRelatedTopicIds.join() === [relatedTopicIds.invite, ...relatedFixtureTopicIds].join(),
		subscriberRelatedTopicIds,
	)
	const teamMemberRelatedTopicIds = await loadRelatedFixtureTopicIds(relatedTopicIds.page, teamMemberId)
	check(
		"the team member's related topics add the private topic their team holds and nothing else hidden",
		teamMemberRelatedTopicIds.join() === [relatedTopicIds.private, ...relatedFixtureTopicIds].join(),
		teamMemberRelatedTopicIds,
	)
	const noAccessRelatedTopicIds = await loadRelatedFixtureTopicIds(relatedTopicIds.page, paidOwnerId)
	check(
		"a user with no access to the hidden topics sees the visitor's related topics",
		noAccessRelatedTopicIds.join() === relatedFixtureTopicIds.join(),
		noAccessRelatedTopicIds,
	)

	// the private topic's own page lists related topics to its owner and to the team member, the page's topic among them
	const privateRelatedTopicIds = await loadRelatedFixtureTopicIds(relatedTopicIds.private, ownerId)
	const teamMemberPrivateRelatedTopicIds = await loadRelatedFixtureTopicIds(relatedTopicIds.private, teamMemberId)
	check(
		"the private topic's page lists related topics to its owner and to the team member",
		privateRelatedTopicIds.includes(relatedTopicIds.page) &&
			teamMemberPrivateRelatedTopicIds.includes(relatedTopicIds.page),
		{ privateRelatedTopicIds, teamMemberPrivateRelatedTopicIds },
	)
}

// the fixture topics among a topic page's related topics for a user, or for a visitor
async function loadRelatedFixtureTopicIds(topicId: string, userId: string | null): Promise<string[]> {
	const topicPage = await loadTopicPage(userId, topicId)
	const relatedTopics = topicPage?.relatedTopics ?? []
	return relatedTopics
		.map((relatedTopic) => relatedTopic.id)
		.filter((relatedTopicId) => relatedTopicId.startsWith(runId))
}

// the page's episode page: its topic's other published episode, the near and the tagged topics' published episodes as
// a visitor's related fixtures, each signed-in user's related episodes, and the private topic's episode page
async function checkPodcastEpisodeTables(): Promise<void> {
	// the visitor's episode page of the page topic's first episode
	const pageEpisodePath = `/topics/${relatedTopicIds.page}/episodes/2026/1`
	const podcastEpisodePage = await (await request({ path: pageEpisodePath, userId: null })).json()
	const topicPodcastEpisodeIds = podcastEpisodePage.topicPodcastEpisodes?.map(({ id }: { id: string }) => id) ?? []
	check(
		"the episodes table lists the topic's other published episode alone",
		topicPodcastEpisodeIds.join() === `${relatedTopicIds.page}-episode-2`,
		topicPodcastEpisodeIds,
	)
	check(
		"an episodes table row has its description",
		podcastEpisodePage.topicPodcastEpisodes?.[0]?.description === "A related episode.",
	)

	// the related episodes among the fixtures: the near topic's published episode, then the tagged topic's, and not the
	// far topic's
	const relatedFixturePodcastEpisodes =
		podcastEpisodePage.relatedPodcastEpisodes?.filter(({ id }: { id: string }) => id.startsWith(runId)) ?? []
	const visitorRelatedPodcastEpisodeIds = [`${relatedTopicIds.near}-episode-1`, `${relatedTopicIds.tagged}-episode-1`]
	check(
		"related episodes lists the near topic's published episode with its chapter count and its description, then the tagged topic's",
		relatedFixturePodcastEpisodes.length === 2 &&
			relatedFixturePodcastEpisodes[0]?.id === visitorRelatedPodcastEpisodeIds[0] &&
			relatedFixturePodcastEpisodes[1]?.id === visitorRelatedPodcastEpisodeIds[1] &&
			relatedFixturePodcastEpisodes[0]?.chapterCount === 0 &&
			relatedFixturePodcastEpisodes[0]?.description === "A related episode.",
		relatedFixturePodcastEpisodes.map(({ id }: { id: string }) => id),
	)

	// the owner may also listen to the hidden topics' published episodes, which rank first
	const hiddenPodcastEpisodeIds = [
		`${relatedTopicIds.publicNotShown}-episode-1`,
		`${relatedTopicIds.invite}-episode-1`,
		`${relatedTopicIds.invite}-episode-2`,
		`${relatedTopicIds.private}-episode-1`,
	]
	const ownerRelatedPodcastEpisodeIds = await loadFixturePodcastEpisodeIds({
		path: pageEpisodePath,
		userId: ownerId,
		table: "relatedPodcastEpisodes",
	})
	check(
		"the owner's related episodes lead with the hidden topics' episodes, then the visitor's two",
		ownerRelatedPodcastEpisodeIds.slice(0, 4).sort().join() === hiddenPodcastEpisodeIds.toSorted().join() &&
			ownerRelatedPodcastEpisodeIds.slice(4).join() === visitorRelatedPodcastEpisodeIds.join(),
		ownerRelatedPodcastEpisodeIds,
	)

	// the subscriber may also listen to the invite topic's episode published after they subscribed, not the one before,
	// the team member to the private topic's episode, and a user with no access gets what a visitor gets
	const subscriberRelatedPodcastEpisodeIds = await loadFixturePodcastEpisodeIds({
		path: pageEpisodePath,
		userId: subscriberId,
		table: "relatedPodcastEpisodes",
	})
	check(
		"the subscriber's related episodes add the invite topic's episode from after they subscribed and nothing else hidden",
		subscriberRelatedPodcastEpisodeIds.join() ===
			[`${relatedTopicIds.invite}-episode-2`, ...visitorRelatedPodcastEpisodeIds].join(),
		subscriberRelatedPodcastEpisodeIds,
	)
	const teamMemberRelatedPodcastEpisodeIds = await loadFixturePodcastEpisodeIds({
		path: pageEpisodePath,
		userId: teamMemberId,
		table: "relatedPodcastEpisodes",
	})
	check(
		"the team member's related episodes add the private topic's episode and nothing else hidden",
		teamMemberRelatedPodcastEpisodeIds.join() ===
			[`${relatedTopicIds.private}-episode-1`, ...visitorRelatedPodcastEpisodeIds].join(),
		teamMemberRelatedPodcastEpisodeIds,
	)
	const noAccessRelatedPodcastEpisodeIds = await loadFixturePodcastEpisodeIds({
		path: pageEpisodePath,
		userId: paidOwnerId,
		table: "relatedPodcastEpisodes",
	})
	check(
		"a user with no access to the hidden topics gets the visitor's related episodes",
		noAccessRelatedPodcastEpisodeIds.join() === visitorRelatedPodcastEpisodeIds.join(),
		noAccessRelatedPodcastEpisodeIds,
	)

	// the invite topic's later episode page lists the earlier episode under Other episodes for its owner, and none for
	// the subscriber, who subscribed after the earlier one published
	const inviteEpisodePath = `/topics/${relatedTopicIds.invite}/episodes/2026/2`
	const ownerInviteEpisodeIds = await loadFixturePodcastEpisodeIds({
		path: inviteEpisodePath,
		userId: ownerId,
		table: "topicPodcastEpisodes",
	})
	const subscriberInviteEpisodeIds = await loadFixturePodcastEpisodeIds({
		path: inviteEpisodePath,
		userId: subscriberId,
		table: "topicPodcastEpisodes",
	})
	check(
		"an invite topic's other episodes are the owner's whole list and only the subscriber's later ones",
		ownerInviteEpisodeIds.join() === `${relatedTopicIds.invite}-episode-1` && subscriberInviteEpisodeIds.length === 0,
		{ ownerInviteEpisodeIds, subscriberInviteEpisodeIds },
	)

	// the private topic's episode page lists related episodes to its owner, the page topic's among them, and a visitor
	// may not open it
	const privateEpisodePath = `/topics/${relatedTopicIds.private}/episodes/2026/1`
	const privateRelatedPodcastEpisodeIds = await loadFixturePodcastEpisodeIds({
		path: privateEpisodePath,
		userId: ownerId,
		table: "relatedPodcastEpisodes",
	})
	const visitorPrivateEpisodeResponse = await request({ path: privateEpisodePath, userId: null })
	check(
		"the private topic's episode page lists its owner's related episodes, and a visitor may not open it",
		privateRelatedPodcastEpisodeIds.includes(`${relatedTopicIds.page}-episode-1`) &&
			visitorPrivateEpisodeResponse.status !== 200,
		{ privateRelatedPodcastEpisodeIds, visitorStatus: visitorPrivateEpisodeResponse.status },
	)
}

// an episode page's path, the user to load it as or null for a visitor, and which of its two tables to read
type LoadFixturePodcastEpisodeIdsOptions = {
	path: string
	userId: string | null
	table: "relatedPodcastEpisodes" | "topicPodcastEpisodes"
}

// the fixture podcast episodes in one of an episode page's two tables
async function loadFixturePodcastEpisodeIds({
	path,
	userId,
	table,
}: LoadFixturePodcastEpisodeIdsOptions): Promise<string[]> {
	const podcastEpisodePage = await (await request({ path, userId })).json()
	const tablePodcastEpisodes: { id: string }[] = podcastEpisodePage[table] ?? []
	return tablePodcastEpisodes.map(({ id }) => id).filter((podcastEpisodeId) => podcastEpisodeId.startsWith(runId))
}

// the near topic made private: its episode's vector is saved as not public and shown, and a visitor's related topics
// leave it out. its own vector is deleted. the fixtures' findings name no embedded resource, and the scan smoke checks
// a topic vector's flag
async function checkTopicMadePrivateFlags(): Promise<void> {
	// make the near topic private and save its vectors, as a visibility change does
	await db.update(topics).set({ visibility: "private" }).where(eq(topics.id, relatedTopicIds.near))
	await saveTopicVectors(relatedTopicIds.near)

	// its episode's vector flag, and the visitor's related topics on the page
	const [nearPodcastEpisodeVectorRow] = await db
		.select({ isTopicPublicAndShown: podcastEpisodeVectors.isTopicPublicAndShown })
		.from(podcastEpisodeVectors)
		.where(eq(podcastEpisodeVectors.podcastEpisodeId, `${relatedTopicIds.near}-episode-1`))
	const visitorRelatedTopicIds = await loadRelatedFixtureTopicIds(relatedTopicIds.page, null)

	// the flag is off, and the topic has left the visitor's related topics
	check(
		"a topic made private has its episode's vector saved as not public and shown, and leaves a visitor's related topics",
		nearPodcastEpisodeVectorRow?.isTopicPublicAndShown === false &&
			!visitorRelatedTopicIds.includes(relatedTopicIds.near),
		{ nearPodcastEpisodeVectorRow, visitorRelatedTopicIds },
	)
}
