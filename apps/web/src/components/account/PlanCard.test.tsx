// exercise the shared plan composition through the actual web checkmarked row adapter
import { expect, test } from "bun:test"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { PlanCard } from "./PlanCard"

test("both billing intervals show AI sends on every plan and email only on Plus and Premium", async () => {
	for (const plan of ["free", "plus", "premium"] as const) {
		for (const isYearly of [false, true]) {
			// read feature rows separately so the legitimate $200 yearly price is not mistaken for a ceiling
			const html = await renderWithRouter(
				<PlanCard
					plan={plan}
					isYearly={isYearly}
					isHighlighted={false}
					signedInPlan={null}
					subscribedInterval={null}
				/>,
			)
			const rows = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map(([row]) => row)
			const aiRow = rows.find((row) => row.includes("Send AI chats to Carl to read for your topics"))
			const emailRow = rows.find((row) => row.includes("Send emails to Carl to read for your topics"))
			expect(aiRow).toContain("lucide-check")
			if (plan === "free") {
				expect(emailRow).toBeUndefined()
			} else {
				expect(emailRow).toContain("lucide-check")
			}
			expect(rows.join(" ").replace(/<[^>]*>/g, "")).not.toMatch(/200|send ceiling|daily send limit/i)
			expect(html).toContain("Get started")
		}
	}
})

// the free card reads its monthly budget and its scan estimate from the plans catalog
test("the free card shows a $2 monthly budget and about 20 scans a month", async () => {
	const html = await renderWithRouter(
		<PlanCard plan="free" isYearly={false} isHighlighted={false} signedInPlan={null} subscribedInterval={null} />,
	)
	expect(html).toContain("$2 coffee fund a month")
	expect(html).toContain("About 20 Brews a month")
})
