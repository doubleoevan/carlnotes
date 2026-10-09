// the more topics read: nothing for a topic that is not public and shown, and otherwise the other public shown topics
// ordered by a holding team, then shared tags, then the newest finding, up to five
import { afterEach, expect, test } from "bun:test"
import { MINIMUM_SHOWN_FINDINGS } from "@shared/enums"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "../../db/connectionPoolStub"
import { loadMoreTopics, MORE_TOPICS_LIMIT } from "./moreTopics"

// a topic on a team, with two tags
const TOPIC = { id: "topic-1", tags: ["ai", "robots"], teamId: "team-1" }

// the read a query belongs to, by the table it reads: the shown check, the holding teams, or the candidates
function toReadKind(sentQuery: SentQuery): "shown" | "teams" | "candidates" {
	if (sentQuery.text.includes('from "teams"')) {
		return "teams"
	}
	return sentQuery.text.includes("order by") ? "candidates" : "shown"
}

// put the connection pool's own query back after each test
afterEach(() => {
	restoreConnectionPool()
})

test("a topic that is not public and shown links no more topics, with no candidate read", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => (toReadKind(sentQuery) === "teams" ? [["team-1"]] : []))
	expect(await loadMoreTopics(TOPIC)).toEqual([])
	expect(sentQueries.map(toReadKind).sort()).toEqual(["shown", "teams"])
})

test("a shown topic reads its nearest other public shown topics, up to five", async () => {
	// the shown check finds the topic, one public team holds it, and the candidate read returns two topics
	const sentQueries = stubConnectionPool((sentQuery) => {
		const readKind = toReadKind(sentQuery)
		if (readKind === "shown") {
			return [["topic-1"]]
		}
		return readKind === "teams"
			? [["team-1"]]
			: [
					["topic-2", "Robot vacuums"],
					["topic-3", "Agents"],
				]
	})
	expect(await loadMoreTopics(TOPIC)).toEqual([
		{ id: "topic-2", name: "Robot vacuums" },
		{ id: "topic-3", name: "Agents" },
	])

	// the candidate read keeps to public shown topics, leaves the topic out, orders by the holding team, then shared
	// tags, then the newest finding, and stops at the limit
	const candidatesQuery = sentQueries.find((sentQuery) => toReadKind(sentQuery) === "candidates")
	expect(candidatesQuery?.text).toBe(
		'select "id", "name" from "topics" where (("topics"."visibility" = $1 and (select count(*) from "findings" where "findings"."topic_id" = "topics"."id") >= $2) and "topics"."id" <> $3) order by coalesce("topics"."team_id" in ($4) or exists (select 1 from "team_topics" where "team_topics"."topic_id" = "topics"."id" and "team_topics"."team_id" in ($5)), false) desc, (select count(*) from unnest("topics"."tags") as tag where tag = any(array[$6, $7]::text[])) desc, coalesce((select max("findings"."created_at") from "findings" where "findings"."topic_id" = "topics"."id"), "topics"."created_at") desc limit $8',
	)
	expect(candidatesQuery?.values).toEqual([
		"public",
		MINIMUM_SHOWN_FINDINGS,
		"topic-1",
		"team-1",
		"team-1",
		"ai",
		"robots",
		MORE_TOPICS_LIMIT,
	])
})

test("a shown topic on no public team and with no tags orders by the newest finding alone", async () => {
	// the shown check finds the topic and no public team holds it
	const sentQueries = stubConnectionPool((sentQuery) => (toReadKind(sentQuery) === "shown" ? [["topic-1"]] : []))
	expect(await loadMoreTopics({ ...TOPIC, teamId: null, tags: [] })).toEqual([])
	const candidatesQuery = sentQueries.find((sentQuery) => toReadKind(sentQuery) === "candidates")
	expect(candidatesQuery?.text).toMatch(/"id" <> \$3\) order by coalesce\(\(select max\("findings"."created_at"\)/)
	expect(candidatesQuery?.values).toEqual(["public", MINIMUM_SHOWN_FINDINGS, "topic-1", MORE_TOPICS_LIMIT])
})
