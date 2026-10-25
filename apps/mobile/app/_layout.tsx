// the root layout: the stylesheet, the auth and api clients, the fonts behind the splash screen, the providers, and
// the guards over the screens
import "../global.css"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { ArchitectsDaughter_400Regular } from "@expo-google-fonts/architects-daughter"
import { Karla_400Regular, Karla_500Medium, Karla_600SemiBold, Karla_700Bold } from "@expo-google-fonts/karla"
import * as Sentry from "@sentry/react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useFonts } from "expo-font"
import { Stack, usePathname } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { PostHogProvider, usePostHog } from "posthog-react-native"
import { useEffect } from "react"
import { Alert } from "react-native"
import { toApiRequestSettings } from "@/apiRequestSettings"
import { apiBaseUrl, hasSession, mobileAuthClient } from "@/authClient"

// hold the splash screen until the fonts and the session load
SplashScreen.preventAutoHideAsync()

// report errors only when the build has a DSN. a build without one sends nothing and skips the instrumentation
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN
if (sentryDsn) {
	Sentry.init({ dsn: sentryDsn })
}

// the posthog project key the web app already sends to. the host is code instead of a value
const posthogApiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? ""
const POSTHOG_HOST = "https://us.i.posthog.com"

// configure the shared api client once before the first screen renders, after the auth client that its headers read.
// every request sends the stored session cookie, and a 401 signs a revoked session out. an error shows as a native alert
configureApiClient({
	apiBaseUrl,
	showError: (message) => Alert.alert("CarlNotes", message),
	...toApiRequestSettings({
		getCookie: () => mobileAuthClient.getCookie(),
		hasSession,
		signOut: () => mobileAuthClient.signOut(),
	}),
})

// one query client for the whole app
const queryClient = new QueryClient()

// expo router's own error boundary. sentry's router integration captures through it
export { ErrorBoundary } from "expo-router"

function RootLayout() {
	// every face of both families in one call. one family name plus a weight then selects the right face
	const [isFontLoaded, fontLoadError] = useFonts([
		{
			fontFamily: "Karla",
			fontDefinitions: [
				{ path: Karla_400Regular, weight: 400 },
				{ path: Karla_500Medium, weight: 500 },
				{ path: Karla_600SemiBold, weight: 600 },
				{ path: Karla_700Bold, weight: 700 },
			],
		},
		{
			fontFamily: "Architects Daughter",
			fontDefinitions: [{ path: ArchitectsDaughter_400Regular, weight: 400 }],
		},
	])

	// the session, seeded from secure storage before the first read answers. a user sees no loading state
	const { data: session, isPending: isSessionPending } = authClient().useSession()
	const isReady = (isFontLoaded || Boolean(fontLoadError)) && !isSessionPending

	// hide the splash screen once the fonts and the session are in
	useEffect(() => {
		if (isReady) {
			SplashScreen.hideAsync()
		}
	}, [isReady])

	// render nothing until then. no screen flashes a fallback font or the wrong side of the guard
	if (!isReady) {
		return null
	}

	// posthog stays disabled without a key. such a build records nothing
	const isSignedIn = Boolean(session)
	return (
		<PostHogProvider
			apiKey={posthogApiKey}
			options={{ host: POSTHOG_HOST, disabled: !posthogApiKey }}
			autocapture={false}
		>
			<QueryClientProvider client={queryClient}>
				<ScreenViewRecorder />
				{/* the sign-in guard. a user sees the app's screens, and a visitor the sign-in and sign-up screens */}
				<Stack screenOptions={{ headerShown: false }}>
					<Stack.Protected guard={isSignedIn}>
						<Stack.Screen name="index" />
						<Stack.Screen name="settings" />
					</Stack.Protected>
					<Stack.Protected guard={!isSignedIn}>
						<Stack.Screen name="sign-in" />
						<Stack.Screen name="sign-up" />
					</Stack.Protected>

					{/* the component browser, in a development build only */}
					<Stack.Protected guard={__DEV__}>
						<Stack.Screen name="storybook" />
					</Stack.Protected>
				</Stack>
			</QueryClientProvider>
		</PostHogProvider>
	)
}

// record a screen view per route from the router's own hook, the documented way for expo router. only the path goes.
// a sign-in code or token in a route's params never reaches analytics
function ScreenViewRecorder() {
	const posthog = usePostHog()
	const pathname = usePathname()
	useEffect(() => {
		posthog.screen(pathname)
	}, [posthog, pathname])
	return null
}

export default Sentry.wrap(RootLayout)
