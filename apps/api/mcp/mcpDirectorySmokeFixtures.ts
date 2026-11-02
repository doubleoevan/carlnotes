// isolated private access, large feed, and search fixtures for the directory smoke checks
import { db } from "@carlnotes/db"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { sources, subscriptions, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { eq, inArray } from "drizzle-orm"
import { toAcceptedTermsFields } from "../testSession"
import { check, ownerId, runId } from "./mcpSmokeFixtures"

// a private topic and a public feed whose first page reaches the count limit and later pages the character limit
export const privateTopicId = `${runId}-private`
export const largeTopicId = `${runId}-large`
export const subscribedTopicId = `${runId}-subscribed`
export const subscribedTeamId = `${runId}-team`
export const searchQuery = runId.replaceAll(/[^a-z0-9]/g, "")
export const expectedFindings = Array.from({ length: 45 }, (_, index) => ({
	findingId: `${runId}-large-finding-${index}`,
	relevanceExplanation: `Explanation ${index}: ${"x".repeat(index < 20 ? 40 : 6000)}`,
}))

// fifty profiles and the public topic produce a full fifty-row search page and one remaining result
const profileIds = Array.from({ length: 50 }, (_, index) => `${searchQuery}profile${index}`)
const resourceIds = [...expectedFindings.map((finding) => `${finding.findingId}-resource`), `${runId}-private-resource`]

/** Seeds the private topic, the long public feed, and searchable profiles under this run's IDs. */
export async function seedDirectoryFixtures(): Promise<void> {
	// create searchable profiles and two topics held by the smoke owner
	await db.insert(users).values(
		profileIds.map((id) => ({
			id,
			name: id,
			email: `${id}@example.com`,
			username: id,
			usernameNormalized: id,
			...toAcceptedTermsFields(),
		})),
	)

	// give a different fixture owner a team and a followed topic
	await db.insert(teams).values({ id: subscribedTeamId, name: subscribedTeamId })
	await db.insert(teamMembers).values({ teamId: subscribedTeamId, userId: `${searchQuery}profile0`, role: "leader" })

	// create private, public, and subscribed topics for the access and pagination checks
	await db.insert(topics).values([
		{ id: privateTopicId, ownerId, name: `${runId} private`, prompt: "smoke", visibility: "private" },
		{ id: largeTopicId, ownerId, name: `${searchQuery} large feed`, prompt: "smoke", visibility: "public" },
		{
			id: subscribedTopicId,
			ownerId: `${searchQuery}profile0`,
			teamId: subscribedTeamId,
			name: `${runId} followed`,
			prompt: "public prompt",
			visibility: "public",
		},
	])
	await db.insert(subscriptions).values({ topicId: subscribedTopicId, subscriberUserId: ownerId })
	await db.insert(sources).values({
		topicId: subscribedTopicId,
		kind: "rss",
		status: "ready",
		config: { url: "https://example.test/public" },
	})

	// seed resources and findings with fixed IDs for traversal and cleanup assertions
	await db.insert(resources).values(
		resourceIds.map((id) => ({
			id,
			url: `https://example.test/${id}`,
			kind: "read" as const,
			title: id,
		})),
	)
	await seedTopicFindings(largeTopicId, expectedFindings)
	await seedTopicFindings(privateTopicId, [
		{ findingId: `${runId}-private-finding`, relevanceExplanation: "Private finding." },
	])
}

/** Removes directory fixtures after the owner cleanup has cascaded through their Topics and Findings. */
export async function cleanUpDirectoryFixtures(): Promise<void> {
	// remove the extra profiles and their resources
	await db.delete(users).where(inArray(users.id, profileIds))
	await db.delete(resources).where(inArray(resources.id, resourceIds))
	await db.delete(teams).where(eq(teams.id, subscribedTeamId))

	// prove both the owner's cascades and the separately owned rows have left no seeded records
	const [remainingTopics, remainingUsers, remainingResources, remainingTeams] = await Promise.all([
		db
			.select({ id: topics.id })
			.from(topics)
			.where(inArray(topics.id, [privateTopicId, largeTopicId, subscribedTopicId])),
		db
			.select({ id: users.id })
			.from(users)
			.where(inArray(users.id, [ownerId, ...profileIds])),
		db.select({ id: resources.id }).from(resources).where(inArray(resources.id, resourceIds)),
		db.select({ id: teams.id }).from(teams).where(eq(teams.id, subscribedTeamId)),
	])
	check(
		"directory fixtures are removed",
		remainingTopics.length + remainingUsers.length + remainingResources.length + remainingTeams.length === 0,
	)
}

// seed one succeeded scan and its findings with relevance scores that fix their feed order
async function seedTopicFindings(topicId: string, entries: typeof expectedFindings): Promise<void> {
	const scanId = `${topicId}-scan`
	await db.insert(scans).values({ id: scanId, topicId, ownerId, status: "succeeded" })
	await db.insert(findings).values(
		entries.map((entry, index) => ({
			id: entry.findingId,
			topicId,
			resourceId: topicId === largeTopicId ? `${entry.findingId}-resource` : `${runId}-private-resource`,
			scanId,
			foundScanId: scanId,
			relevanceScore: 1 - index / 100,
			relevanceExplanation: entry.relevanceExplanation,
		})),
	)
}
