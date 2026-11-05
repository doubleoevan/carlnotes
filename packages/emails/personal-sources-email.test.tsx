// email refusals distinguish a temporary shared ceiling from plan eligibility
import { expect, test } from "bun:test"
import { render } from "@react-email/render"
import PersonalSourcesEmail from "./personal-sources-email"

test("the email ceiling refusal is plain and does not advertise a larger plan allowance", async () => {
	const text = await render(
		<PersonalSourcesEmail receivingAddress="carl@example.com" reply={{ kind: "not_filed", reason: "quota" }} />,
		{
			plainText: true,
		},
	)
	expect(text).toContain("The day's email limit is reached.")
	expect(text).toContain("Nothing was saved.")
	expect(text).toContain("midnight UTC")
	expect(text).not.toMatch(/Premium|upgrade|100 accepted/i)
})

test("the email capability refusal names both eligible plans", async () => {
	const text = await render(
		<PersonalSourcesEmail receivingAddress="carl@example.com" reply={{ kind: "not_filed", reason: "plan" }} />,
		{
			plainText: true,
		},
	)
	expect(text).toContain("Plus or Premium")
	expect(text).toContain("/plans")
	expect(text).not.toContain("Carl receives only what you choose to send")
	expect(text).not.toContain("mailbox history")
	expect(text).not.toContain("If you didn't ask for this")
})

test("account guidance links to sign-in without exposing a Topic or a message", async () => {
	const text = await render(
		<PersonalSourcesEmail receivingAddress="carl@example.com" reply={{ kind: "not_filed", reason: "account" }} />,
		{ plainText: true },
	)
	expect(text).toContain("email address you use for CarlNotes")
	expect(text).toContain("/login")
})
