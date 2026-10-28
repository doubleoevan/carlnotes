import { toApiUrl } from "@carlnotes/client/apiClient"
import { Image } from "expo-image"
import { Play } from "lucide-react-native"
import { useEffect, useRef, useState } from "react"
import { AppState, Pressable, View } from "react-native"
import NativeYoutubePlayer from "react-native-youtube-iframe"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { shouldLoadYoutubePlayerUrl, YOUTUBE_PLAYER_BASE_URL } from "@/youtubePlayer"
import { YoutubePlayIcon } from "./BrandIcon"

// the source video and the thumbnail served by CarlNotes
export type YoutubePlayerProps = {
	youtubeVideoId: string
	title: string | null
	thumbnailPath: string | null
	hasYoutubePlayButton?: boolean
	onPlay?: () => void
}

/**
 * Plays a YouTube video inline after a tap and stops when the app leaves the foreground.
 */
export function YoutubePlayer({
	youtubeVideoId,
	title,
	thumbnailPath,
	hasYoutubePlayButton,
	onPlay,
}: YoutubePlayerProps) {
	// mount the embedded player only after the user requests playback
	const [isRequested, setIsRequested] = useState(false)
	const [isReady, setIsReady] = useState(false)
	const [hasPlaybackError, setHasPlaybackError] = useState(false)
	const [width, setWidth] = useState(0)
	const hasRecordedPlay = useRef(false)
	const height = Math.max(200, (width * 9) / 16)
	const videoTitle = title || "YouTube video"
	useEffect(() => {
		const listener = AppState.addEventListener("change", (state) => {
			if (state !== "active") {
				setIsRequested(false)
				setIsReady(false)
			}
		})
		return () => listener.remove()
	}, [])

	// record the first actual play during this opening
	const handlePlayerState = (state: string): void => {
		if (state === "playing" && !hasRecordedPlay.current) {
			hasRecordedPlay.current = true
			onPlay?.()
		}
	}
	// retain inline playback when YouTube requests a watch page or an app intent
	const handleNavigation = ({ url }: { url: string }): boolean => {
		return shouldLoadYoutubePlayerUrl(url)
	}
	return (
		<View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
			{/* keep the preview in place until playback is requested */}
			{isRequested && !hasPlaybackError && width > 0 ? (
				<View style={{ height }}>
					<NativeYoutubePlayer
						baseUrlOverride={YOUTUBE_PLAYER_BASE_URL}
						videoId={youtubeVideoId}
						width={width}
						height={height}
						play
						onReady={() => setIsReady(true)}
						onChangeState={handlePlayerState}
						onError={() => setHasPlaybackError(true)}
						webViewProps={{
							accessibilityLabel: videoTitle,
							allowsInlineMediaPlayback: true,
							allowsFullscreenVideo: true,
							mediaPlaybackRequiresUserAction: false,
							// intercept every scheme before the OS can hand it to another app
							originWhitelist: ["*"],
							onShouldStartLoadWithRequest: handleNavigation,
							onOpenWindow: () => {
								// keep player popups from launching another app
							},
							onError: () => setHasPlaybackError(true),
						}}
					/>
					{!isReady ? (
						<View className="absolute inset-0 items-center justify-center bg-card" pointerEvents="none">
							<CoffeeLoading label="Loading your video" />
						</View>
					) : null}
				</View>
			) : (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`Play ${videoTitle}`}
					accessibilityHint="Plays the video here"
					disabled={hasPlaybackError}
					onPress={() => setIsRequested(true)}
					style={{ height }}
					className="items-center justify-center bg-card"
				>
					{thumbnailPath ? (
						<Image
							source={{ uri: toApiUrl(thumbnailPath) }}
							style={{ position: "absolute", width: "100%", height: "100%" }}
							contentFit="cover"
							accessible={false}
						/>
					) : null}
					{hasYoutubePlayButton ? (
						<YoutubePlayIcon size={80} />
					) : (
						<View className="absolute inset-0 items-center justify-center bg-black/30">
							<View className="size-12 items-center justify-center rounded-full bg-primary">
								<Icon as={Play} className="ml-0.5 size-5 text-primary-foreground" fill="currentColor" />
							</View>
						</View>
					)}
				</Pressable>
			)}
			{/* explain unavailable playback in place */}
			{hasPlaybackError ? (
				<Text accessibilityRole="alert" className="px-3 py-2 text-sm text-muted-foreground">
					{"This video can't play here."}
				</Text>
			) : null}
		</View>
	)
}
