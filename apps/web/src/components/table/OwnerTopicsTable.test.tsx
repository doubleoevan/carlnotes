// the topics table's subscriber count: a button that opens the subscribers in the admin console, and plain text
// elsewhere
import { expect, test } from "bun:test"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { OWNER_TOPIC_FIXTURES } from "../../../.storybook/fixtures/topics"
import { OwnerTopicsTable } from "./OwnerTopicsTable"

// the first fixture topic, which has twelve subscribers
const [SUBSCRIBED_TOPIC] = OWNER_TOPIC_FIXTURES
if (!SUBSCRIBED_TOPIC) {
	throw new Error("the owner topic fixtures are empty")
}

test("in the admin console, a subscriber count is a button that opens the subscribers", async () => {
	const tableHtml = await renderWithRouter(
		<OwnerTopicsTable topics={[SUBSCRIBED_TOPIC]} onReloadPage={() => {}} canListSubscribers />,
	)
	expect(tableHtml).toContain(`aria-label="Show ${SUBSCRIBED_TOPIC.name}&#x27;s followers, 12"`)
	expect(tableHtml).toContain('aria-expanded="false"')
})

test("on the owner's profile, a subscriber count is plain text", async () => {
	const tableHtml = await renderWithRouter(<OwnerTopicsTable topics={[SUBSCRIBED_TOPIC]} onReloadPage={() => {}} />)
	expect(tableHtml).not.toContain("followers, 12")
	expect(tableHtml).toContain(">12</td>")
})
