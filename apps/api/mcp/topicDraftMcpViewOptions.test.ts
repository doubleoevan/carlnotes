import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as cutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import { loadTopicDraftMcpViewOptions } from "./topicDraftMcpViewOptions"

const caller = {
	kind: "user" as const,
	userId: "owner",
	plan: "plus" as const,
	clientName: "fixture",
	clientId: "fixture-client",
}
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})
test.each([false, true])(
	"draft tags use editable Topics and podcast default follows the existing cutoff: %s",
	async (isPastCutoff) => {
		const statements: string[] = []
		stubConnectionPool(({ text, values }) => {
			statements.push(text)
			expect(values).toContain("owner")
			return [["terrarium"], ["humidity"]]
		})
		const cutoff = spyOn(cutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(isPastCutoff)
		expect(await loadTopicDraftMcpViewOptions(caller)).toEqual({
			knownTags: ["humidity", "terrarium"],
			isPodcastEnabledByDefault: !isPastCutoff,
		})
		expect(cutoff).toHaveBeenCalledWith("owner", "podcastEpisodes")
		expect(statements[0]).toContain('"team_members"')
	},
)
test("visitors receive no account tags or enabled podcast default", async () => {
	expect(await loadTopicDraftMcpViewOptions({ kind: "visitor", clientName: "fixture" })).toEqual({
		knownTags: [],
		isPodcastEnabledByDefault: false,
	})
})
