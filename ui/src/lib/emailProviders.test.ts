// compose url tests. every email provider encodes what it is given, and the row leads with the user's own provider
import { expect, test } from "bun:test"
import { EMAIL_PROVIDERS, toEmailProviders } from "./emailProviders"

// a subject and body that include the characters a query string would otherwise swallow
const SUBJECT = "Evan invited you to Cute raccoon videos"
const BODY = "Join here: https://carlnotes.com/join/abc?x=1&y=2"

// every provider in the map encodes both fields, so nothing arrives truncated at the ampersand
test("every compose url encodes its subject and body", () => {
	for (const provider of EMAIL_PROVIDERS) {
		const url = provider.toUrl(SUBJECT, BODY, null)

		// the raw spaces and the body's own separators never reach the url
		expect(url).not.toContain(" ")
		expect(url).toContain(encodeURIComponent(SUBJECT))
		expect(url).toContain(encodeURIComponent(BODY))
	}
})

// outlook's consumer and work accounts sit behind different deep links, selected from the user's own address
test("the outlook url follows the account kind", () => {
	const outlook = EMAIL_PROVIDERS.find((provider) => provider.key === "outlook")
	expect(outlook).toBeDefined()

	// a hotmail address is a personal account, and a workplace address is not
	expect(outlook?.toUrl(SUBJECT, BODY, "user@hotmail.com")).toContain("outlook.live.com")
	expect(outlook?.toUrl(SUBJECT, BODY, "user@company.com")).toContain("outlook.office.com")
	// with no address to read, the button opens the consumer composer
	expect(outlook?.toUrl(SUBJECT, BODY, null)).toContain("outlook.live.com")
})

// the row leads with the provider the user's own address suggests
test("toOrderedEmailProviders puts the user's own provider first", () => {
	expect(toEmailProviders("user@gmail.com")[0]?.key).toBe("gmail")
	expect(toEmailProviders("USER@Hotmail.com")[0]?.key).toBe("outlook")
	expect(toEmailProviders("user@pm.me")[0]?.key).toBe("proton")
})

// an address on no known provider, or none at all, leaves the providers in order
test("toOrderedEmailProviders leaves an unknown address in order", () => {
	const providerKeys = EMAIL_PROVIDERS.map((provider) => provider.key)
	expect(toEmailProviders("user@company.com").map((provider) => provider.key)).toEqual(providerKeys)
	expect(toEmailProviders(null).map((provider) => provider.key)).toEqual(providerKeys)
	// every provider survives the reorder, so no button is ever dropped
	expect(toEmailProviders("user@gmail.com")).toHaveLength(EMAIL_PROVIDERS.length)
})
