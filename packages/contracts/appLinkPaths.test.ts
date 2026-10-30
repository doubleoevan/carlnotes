import { expect, test } from "bun:test"
import { toAndroidAppLinkIntentFilters, toAppleAppSiteAssociation, toAssetLinks } from "./appLinkPaths"

test("the apple document names the app and every listed path, and web credentials for the same app", () => {
	const document = toAppleAppSiteAssociation({ appleTeamId: "TEAM123", bundleIdentifier: "com.carlnotes.app" })
	const details = (document.applinks as { details: { appIDs: string[]; components: { "/": string }[] }[] }).details
	expect(details[0]?.appIDs).toEqual(["TEAM123.com.carlnotes.app"])
	expect(details[0]?.components.map((component) => component["/"])).toContain("/topics/*")
	expect(details[0]?.components.map((component) => component["/"])).not.toContain("/terms")
	expect(document.webcredentials).toEqual({ apps: ["TEAM123.com.carlnotes.app"] })
})

test("the asset links name the package and every fingerprint", () => {
	const [statement] = toAssetLinks({ packageName: "com.carlnotes.app", sha256CertFingerprints: ["AA:BB", "CC:DD"] })
	expect(statement?.relation).toContain("delegate_permission/common.handle_all_urls")
	expect(statement?.target).toEqual({
		namespace: "android_app",
		package_name: "com.carlnotes.app",
		sha256_cert_fingerprints: ["AA:BB", "CC:DD"],
	})
})

test("the intent filters verify the host over every listed path", () => {
	const [filter] = toAndroidAppLinkIntentFilters("carlnotes.com")
	expect(filter?.autoVerify).toBe(true)
	expect(filter?.data).toContainEqual({ scheme: "https", host: "carlnotes.com", pathPrefix: "/topics/" })
	expect(filter?.data).toContainEqual({ scheme: "https", host: "carlnotes.com", path: "/search" })
})
