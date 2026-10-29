// the root layout: the stylesheet, the auth and api clients, the fonts behind the splash screen, the providers, and
// the guards over the screens
import "../global.css"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { activateChatAccount } from "@carlnotes/core/stores/chatConversationStore"
import { useIsPodcastPlayerShown } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { ArchitectsDaughter_400Regular } from "@expo-google-fonts/architects-daughter"
import {
	Karla_400Regular,
	Karla_400Regular_Italic,
	Karla_500Medium,
	Karla_500Medium_Italic,
	Karla_600SemiBold,
	Karla_600SemiBold_Italic,
	Karla_700Bold,
	Karla_700Bold_Italic,
} from "@expo-google-fonts/karla"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { PortalHost } from "@rn-primitives/portal"
import * as Sentry from "@sentry/react-native"
import { useFonts } from "expo-font"
import { ErrorBoundary as ExpoErrorBoundary, router, Stack, useNavigationContainerRef, usePathname } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { useEffect, useState } from "react"
import { Alert, AppState, KeyboardAvoidingView, Platform, View } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { apiBaseUrl } from "@/authClient"
import { AppChatPanel } from "@/components/chat/AppChatPanel"
import { PodcastEpisodeAudio } from "@/components/podcast/PodcastEpisodeAudio"
import { PodcastPlayer } from "@/components/podcast/PodcastPlayer"
import { mobileApiRequestSettings } from "@/mobileApiRequestSettings"
import { navigationIntegration, startMonitoring } from "@/monitoring"
import { NoteDraftProvider } from "@/providers/NoteDraftProvider"
import { TopicFeedProvider } from "@/providers/TopicFeedProvider"
import { TopicResourceInfoProvider } from "@/providers/TopicResourceInfoProvider"
import { useIsSessionRetired } from "@/sessionExit"
import { takeSessionReturnPath } from "@/sessionReturnPath"
import { restoreTheme } from "@/theme"
import { captureVisit, visitAnalytics } from "@/visitAnalytics"

// hold the splash screen until the fonts and the session load
SplashScreen.preventAutoHideAsync()

// configure crash and route monitoring before the first screen
startMonitoring()

// configure the shared api client once before the first screen renders, after the auth client that its headers read.
// every request sends the stored session cookie, and a 401 signs a revoked session out. an error shows as a native alert
configureApiClient({
	apiBaseUrl,
	showError: (message) => Alert.alert("CarlNotes", message),
	...mobileApiRequestSettings,
})

// report route render failures while retaining Expo Router's retry screen
export const ErrorBoundary = Sentry.wrapExpoRouterErrorBoundary(ExpoErrorBoundary)

function RootLayout() {
	const navigationRef = useNavigationContainerRef()
	const isPodcastPlayerShown = useIsPodcastPlayerShown()
	// restore the saved appearance behind the splash screen
	const [isThemeReady, setIsThemeReady] = useState(false)
	useEffect(() => {
		void restoreTheme().then(() => setIsThemeReady(true))
	}, [])

	// every face of both families in one call. one family name plus a weight then selects the right face
	const [isFontLoaded, fontLoadError] = useFonts([
		{
			fontFamily: "Karla",
			fontDefinitions: [
				{ path: Karla_400Regular, weight: 400 },
				{ path: Karla_400Regular_Italic, weight: 400, style: "italic" },
				{ path: Karla_500Medium, weight: 500 },
				{ path: Karla_500Medium_Italic, weight: 500, style: "italic" },
				{ path: Karla_600SemiBold, weight: 600 },
				{ path: Karla_600SemiBold_Italic, weight: 600, style: "italic" },
				{ path: Karla_700Bold, weight: 700 },
				{ path: Karla_700Bold_Italic, weight: 700, style: "italic" },
			],
		},
		{
			fontFamily: "Architects Daughter",
			fontDefinitions: [{ path: ArchitectsDaughter_400Regular, weight: 400 }],
		},
	])

	// the session, seeded from secure storage before the first read answers. a user sees no loading state
	const { data: session, isPending: isSessionPending } = authClient().useSession()
	const isSessionRetired = useIsSessionRetired(session?.session.id)
	// activate chat state for the current account
	const chatAccountId = isSessionRetired ? null : (session?.user.id ?? null)
	useEffect(() => {
		activateChatAccount(chatAccountId)
	}, [chatAccountId])
	const isReady = isThemeReady && (isFontLoaded || Boolean(fontLoadError)) && !isSessionPending

	// attach monitoring after the guarded navigator has mounted
	useEffect(() => {
		if (isReady && Sentry.getClient()) {
			navigationIntegration.registerNavigationContainer(navigationRef)
		}
	}, [isReady, navigationRef])

	// hide the splash screen once the fonts and the session are in
	useEffect(() => {
		if (isReady) {
			SplashScreen.hideAsync()
		}
	}, [isReady])

	// restore a visitor's requested page after the signed-in route tree mounts
	useEffect(() => {
		if (!session || !isReady || isSessionRetired) {
			return
		}
		const path = takeSessionReturnPath()
		if (path) {
			router.replace(path)
		}
	}, [session, isReady, isSessionRetired])

	// render nothing until then. no screen flashes a fallback font or the wrong side of the guard
	if (!isReady) {
		return null
	}

	// gate screens by the current session
	const isSignedIn = Boolean(session) && !isSessionRetired
	const userId = isSignedIn ? (session?.user.id ?? null) : null
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<TopicFeedProvider userId={userId} canBrowse={!isSessionRetired}>
				<NoteDraftProvider userId={userId} />
				{/* keep sheet content inside the account's query and search contexts */}
				<BottomSheetModalProvider>
					<TopicResourceInfoProvider userId={userId}>
						<ScreenViewRecorder />
						{!isSessionRetired && <PodcastEpisodeAudio userId={userId} />}
						{/* allow public reading while keeping account screens and chat behind sign-in */}
						<KeyboardAvoidingView
							style={{ flex: 1 }}
							enabled={isPodcastPlayerShown}
							behavior={Platform.OS === "ios" ? "padding" : undefined}
						>
							<View style={{ flex: 1 }}>
								<Stack screenOptions={{ headerShown: false }}>
									<Stack.Protected guard={!isSessionRetired}>
										<Stack.Screen name="(tabs)" />
										<Stack.Screen name="profiles/[userId]" />
										<Stack.Screen name="teams/[teamId]" />
										<Stack.Screen name="topics/[topicId]" />
										<Stack.Screen name="topics/[topicId]/episodes/[season]/[episodeNumber]" />
										<Stack.Screen name="topics/[topicId]/notes/[noteId]" />
										<Stack.Screen name="teams/[teamId]/notes/[noteId]" />
									</Stack.Protected>
									<Stack.Protected guard={isSignedIn}>
										<Stack.Screen name="chat" />
										<Stack.Screen name="account" />
										<Stack.Screen name="plans" />
										<Stack.Screen name="activity" />
										<Stack.Screen name="teams/index" />
										<Stack.Screen name="teams/[teamId]/chat" />
										<Stack.Screen name="topics/[topicId]/chat" />
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
								{isSignedIn && <AppChatPanel />}
							</View>
							{!isSessionRetired && <PodcastPlayer />}
						</KeyboardAvoidingView>
					</TopicResourceInfoProvider>
				</BottomSheetModalProvider>
				{/* anchor dropdowns above both screens and the modal provider's sheets */}
				<PortalHost />
			</TopicFeedProvider>
		</GestureHandlerRootView>
	)
}

// record a screen view per route from the router's own hook, the documented way for expo router. only the path goes.
// a sign-in code or token in a route's params never reaches analytics
function ScreenViewRecorder() {
	const pathname = usePathname()
	useEffect(() => {
		captureVisit(pathname)
	}, [pathname])
	// flush memory-backed events when the app backgrounds
	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => {
			if (state !== "active") {
				void visitAnalytics?.flush().catch(() => undefined)
			}
		})
		return () => subscription.remove()
	}, [])
	return null
}

export default Sentry.wrap(RootLayout)
