// dashboard daily count row tests: a team's Dashboard leaves out a private topic whose legacy Personal sources text is
// not converted yet, and a person's Dashboard reads their own topics outside any team
import { expect, test } from "bun:test"
import type { DashboardSubject } from "@carlnotes/contracts/dashboards"
import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { toSubjectTopicFilter } from "./dashboardDailyCountRows"

// the sql and the parameters that a select of a Dashboard's topics renders
function toSubjectTopicQuery(subject: DashboardSubject): { sql: string; params: unknown[] } {
	return db.select({ id: topics.id }).from(topics).where(toSubjectTopicFilter(subject)).toSQL()
}

test("a team's Dashboard leaves out a private topic whose Personal sources text is not converted yet", () => {
	const { sql, params } = toSubjectTopicQuery({ dashboardKind: "teamDashboard", subjectId: "team-1" })

	// a public or invite topic stays in, and a private one only once no Personal sources context is at version 0
	expect(sql).toContain(
		'("topics"."visibility" <> $2 or "topics"."id" not in (select "topic_id" from "topic_personal_source_contexts" where "topic_personal_source_contexts"."public_outputs_version" = $3))',
	)
	expect(params).toEqual(["team-1", "private", 0])
})

test("a person's Dashboard reads their own topics outside any team", () => {
	const { sql, params } = toSubjectTopicQuery({ dashboardKind: "topicDashboard", subjectId: "user-1" })
	expect(sql).toContain('("topics"."owner_id" = $1 and "topics"."team_id" is null)')
	expect(params).toEqual(["user-1"])
})
