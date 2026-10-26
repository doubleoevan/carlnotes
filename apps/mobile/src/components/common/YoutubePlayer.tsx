import { toApiUrl } from "@carlnotes/client/apiClient"
import { toYoutubeWatchUrl } from "@carlnotes/contracts/youtube"
import { Image } from "expo-image"
import { Play } from "lucide-react-native"
import { useEffect, useRef, useState } from "react"
import { AppState, Pressable, View } from "react-native"
import NativeYoutubePlayer from "react-native-youtube-iframe"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { AnchorLink } from "./AnchorLink"

// the source video and the thumbnail served by CarlNotes
export type YoutubePlayerProps = {
	youtubeVideoId: string
	title: string | null
	thumbnailPath: string | null
	onPlay?: () => void
}

/**
 * Plays a YouTube video inline after a tap and stops when the app leaves the foreground.
 */
export function YoutubePlayer({ youtubeVideoId, title, thumbnailPath, onPlay }: YoutubePlayerProps) {
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
	return (
		<View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
			{/* keep the preview in place until playback is requested */}
			{isRequested && !hasPlaybackError && width > 0 ? (
				<View style={{ height }}>
					<NativeYoutubePlayer
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
					<View className="size-12 items-center justify-center rounded-full bg-primary shadow-raised">
						<Icon as={Play} className="size-5 text-primary-foreground" fill="currentColor" />
					</View>
				</Pressable>
			)}
			{/* retain a working destination when the publisher disables embedding */}
			{hasPlaybackError ? (
				<AnchorLink
					href={toYoutubeWatchUrl(youtubeVideoId)}
					accessibilityLabel={`Open ${videoTitle} on YouTube`}
					hitSlop={toTouchTargetHitSlop(44)}
					className="min-h-11 justify-center px-3 py-2"
				>
					<Text className="text-sm text-link">This video needs to open on YouTube.</Text>
				</AnchorLink>
			) : null}
		</View>
	)
}
