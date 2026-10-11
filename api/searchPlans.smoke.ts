// a live smoke test for the name searches' trigram indexes and the topic ranking's plan, against the dev database.
// run it with: bun run smoke:search-plans
import { sql } from "drizzle-orm"
import { db } from "../db"
import { EMBED_DIMENSIONS } from "../db/schema/scans"
import { topics } from "../db/schema/topics"
import { toRankTopicFindingsQuery } from "../worker/chat/retrieve"
import { toUserSearchQuery } from "./profiles"
import { toTeamSearchQuery } from "./team/search"
import { toTopicSearchQuery } from "./topic/search"

// a question vector of zeros, which ranks every finding the same and plans like any other
const ZERO_QUESTION_VECTOR = Array.from({ length: EMBED_DIMENSIONS }, () => 0)

// the plan lines of a query, read inside one transaction with sequential scans off if asked
async function readPlan(query: unknown, isSequentialScanOff: boolean): Promise<string> {
	return db.transaction(async (transaction) => {
		// the setting lasts for this transaction alone
		if (isSequentialScanOff) {
			await transaction.execute(sql`set local enable_seqscan = off`)
		}

		// the plan's lines
		const { rows } = await transaction.execute(sql`explain ${query as never}`)
		return rows.map((row) => String(row["QUERY PLAN"])).join("\n")
	})
}

// fail the smoke with the plan if it is not the expected one
function assertPlan(planName: string, plan: string, isPlanExpected: boolean, expectedPlanDescription: string): void {
	if (!isPlanExpected) {
		throw new Error(`${planName}: expected ${expectedPlanDescription}\n${plan}`)
	}
	console.log(`${planName}: ok`)
}

// the topic ranking, on three real topics, never takes the HNSW index. an empty topics table plans nothing
const topicRows = await db.select({ id: topics.id }).from(topics).limit(3)
const topicIds = topicRows.map((topicRow) => topicRow.id)
if (topicIds.length === 0) {
	throw new Error("topic ranking: the database has no topics to plan against")
}
const topicRankingPlan = await readPlan(toRankTopicFindingsQuery(topicIds, ZERO_QUESTION_VECTOR, 8), false)
assertPlan(
	"topic ranking",
	topicRankingPlan,
	!topicRankingPlan.includes("resources_embedding_hnsw"),
	"no HNSW index scan",
)

// each name search reads its trigram index, with sequential scans off so a small table cannot hide a missing index
const userSearchPlan = await readPlan(toUserSearchQuery("agent"), true)
assertPlan(
	"username search",
	userSearchPlan,
	userSearchPlan.includes("users_username_normalized_trgm"),
	"a scan on users_username_normalized_trgm",
)
const teamSearchPlan = await readPlan(toTeamSearchQuery("agent", null), true)
assertPlan(
	"team search",
	teamSearchPlan,
	teamSearchPlan.includes("teams_name_lower_trgm"),
	"a scan on teams_name_lower_trgm",
)
const topicSearchPlan = await readPlan(toTopicSearchQuery({ userId: null, query: "agent", isAdmin: false }), true)
assertPlan(
	"topic search",
	topicSearchPlan,
	topicSearchPlan.includes("topics_name_lower_trgm"),
	"a scan on topics_name_lower_trgm",
)
process.exit(0)
