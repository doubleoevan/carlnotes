// the web paths the installed app opens as app links, one entry per implemented destination. this module imports
// nothing. the app's config loads it under Node, which resolves no extensionless relative import

// one destination: Apple's path component with its wildcard, and the Android data filter that matches the same paths
export type AppLinkPath = {
	applePathComponent: string
	androidDataFilter: { path: string } | { pathPrefix: string }
}

export const APP_LINK_PATHS: readonly AppLinkPath[] = [
	{ applePathComponent: "/", androidDataFilter: { path: "/" } },
	{ applePathComponent: "/topics/*", androidDataFilter: { pathPrefix: "/topics/" } },
	{ applePathComponent: "/teams", androidDataFilter: { path: "/teams" } },
	{ applePathComponent: "/teams/*", androidDataFilter: { pathPrefix: "/teams/" } },
	{ applePathComponent: "/profiles/*", androidDataFilter: { pathPrefix: "/profiles/" } },
	{ applePathComponent: "/invite/*", androidDataFilter: { pathPrefix: "/invite/" } },
	{ applePathComponent: "/search", androidDataFilter: { path: "/search" } },
	{ applePathComponent: "/activity", androidDataFilter: { path: "/activity" } },
	{ applePathComponent: "/account", androidDataFilter: { path: "/account" } },
	{ applePathComponent: "/plans", androidDataFilter: { path: "/plans" } },
]

// sample urls that the listed paths match
export const APP_LINK_SAMPLE_PATHS: readonly string[] = [
	"/",
	"/topics/topic-1/coffee-slug?season=2",
	"/topics/topic-1/coffee-slug/episodes/2026/7",
	"/topics/topic-1/notes/note-1",
	"/topics/topic-1/chat?chatTeamId=team-1",
	"/teams",
	"/teams/team-1",
	"/teams/team-1/chat",
	"/teams/team-1/notes/note-1",
	"/profiles/user-1",
	"/invite/token-1",
	"/search?q=coffee",
	"/activity",
	"/account",
	"/plans",
]

// what the apple document names: the team and the bundle identifier
export type AppleAppIdentity = { appleTeamId: string; bundleIdentifier: string }

/**
 * Returns the apple-app-site-association document: the app's universal links over the listed paths, and web
 * credentials for the same app.
 */
export function toAppleAppSiteAssociation({
	appleTeamId,
	bundleIdentifier,
}: AppleAppIdentity): Record<string, unknown> {
	const appId = `${appleTeamId}.${bundleIdentifier}`
	return {
		applinks: {
			details: [
				{
					appIDs: [appId],
					components: APP_LINK_PATHS.map((appLinkPath) => ({ "/": appLinkPath.applePathComponent })),
				},
			],
		},
		webcredentials: { apps: [appId] },
	}
}

// what the android document names: the package and its signing certificate fingerprints
export type AndroidAppIdentity = { packageName: string; sha256CertFingerprints: readonly string[] }

/**
 * Returns the assetlinks.json document: the app may handle every url on the host and share its saved sign-ins.
 */
export function toAssetLinks({ packageName, sha256CertFingerprints }: AndroidAppIdentity): Record<string, unknown>[] {
	return [
		{
			relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
			target: {
				namespace: "android_app",
				package_name: packageName,
				sha256_cert_fingerprints: [...sha256CertFingerprints],
			},
		},
	]
}

/**
 * Returns the app config's Android intent filters for the host: one verified filter over every listed path.
 */
export function toAndroidAppLinkIntentFilters(host: string): {
	action: string
	autoVerify: boolean
	data: ({ scheme: string; host: string } & AppLinkPath["androidDataFilter"])[]
	category: string[]
}[] {
	return [
		{
			action: "VIEW",
			autoVerify: true,
			data: APP_LINK_PATHS.map((appLinkPath) => ({ scheme: "https", host, ...appLinkPath.androidDataFilter })),
			category: ["BROWSABLE", "DEFAULT"],
		},
	]
}
