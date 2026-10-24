// the mobile app's identity. the app's config and the api's Apple provider and trusted origins both read this identity

// the iOS bundle identifier and the Android package name
export const MOBILE_APP_BUNDLE_IDENTIFIER = "com.carlnotes.app"

// the url scheme the app opens on, and the origin Better Auth trusts for every url of that scheme
export const MOBILE_APP_SCHEME = "carlnotes"
export const MOBILE_APP_SCHEME_ORIGIN = `${MOBILE_APP_SCHEME}://`
