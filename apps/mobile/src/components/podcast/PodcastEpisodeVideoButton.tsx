// the app's button that opens a podcast episode's film: a film card's play button over the card's image, a row's Video
// pill, or the play button over the film's poster, and the Video sheet its press opens
import { IDLE_PODCAST_EPISODE_PILL_CLASS } from "@carlnotes/core/components/PodcastEpisodePill"
import {
	type PodcastEpisodeVideoButtonElements,
	type PodcastEpisodeVideoButtonProps,
	PodcastEpisodeVideoButton as SharedPodcastEpisodeVideoButton,
} from "@carlnotes/core/components/PodcastEpisodeVideoButton"
import { Image } from "expo-image"
import { Clapperboard, Play } from "lucide-react-native"
import { type ComponentProps, type ComponentRef, useRef } from "react"
import { type GestureResponderEvent, Pressable, View } from "react-native"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text, TextClassContext } from "@/components/primitives/text"
import { useApiImageProps } from "@/hooks/useApiImageProps"
import { captureFilmVisitEvent } from "@/visitAnalytics"
import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"
import { TopicPodcastEpisodeVideoDialog } from "./TopicPodcastEpisodeVideoDialog"

const ELEMENTS: PodcastEpisodeVideoButtonElements = { Button: VideoButton }

/**
 * Renders the shared button that opens a film with the app's button and Video sheet, and reports its press.
 */
export function PodcastEpisodeVideoButton(props: PodcastEpisodeVideoButtonProps) {
	return (
		<SharedPodcastEpisodeVideoButton
			{...props}
			onOpened={(properties) => captureFilmVisitEvent("visit_episode_video_dialog_opened", properties)}
			elements={ELEMENTS}
		/>
	)
}

// the app's button, with the Video sheet while it is open. the sheet returns focus to the button
function VideoButton({
	label,
	size,
	posterUrl,
	podcastEpisode,
	dialogTitle,
	shouldPlayOnLoad,
	isDialogOpen,
	onPress,
	onDialogClose,
}: ComponentProps<PodcastEpisodeVideoButtonElements["Button"]>) {
	// the button the sheet returns focus to, and the poster's source
	const buttonRef = useRef<ComponentRef<typeof View>>(null)
	const posterImageProps = useApiImageProps(posterUrl)

	// the press stops at the button, so it never opens the card or the row it sits on
	const handlePress = (event: GestureResponderEvent): void => {
		event.stopPropagation()
		onPress()
	}
	const dialog = isDialogOpen && (
		<TopicPodcastEpisodeVideoDialog
			podcastEpisodeId={podcastEpisode.id}
			title={dialogTitle}
			shouldPlayOnLoad={shouldPlayOnLoad}
			triggerRef={buttonRef}
			onClose={onDialogClose}
		/>
	)

	// the film's poster at 16:9 under the film player's round play button. the whole poster takes the press, and its
	// url is an api path. an unchecked poster loads with the session and is never stored
	if (size === "thumbnail") {
		return (
			<>
				<Pressable
					ref={buttonRef}
					accessibilityRole="button"
					accessibilityLabel={label}
					className="aspect-video w-30 shrink-0 items-center justify-center overflow-hidden rounded-xs bg-hero active:opacity-75"
					onPress={handlePress}
				>
					{posterImageProps && (
						<Image
							{...posterImageProps}
							contentFit="contain"
							accessible={false}
							style={{ position: "absolute", width: "100%", height: "100%" }}
						/>
					)}
					<View className="size-9 items-center justify-center rounded-full bg-primary shadow-raised">
						<Icon as={Play} className="size-4 text-primary-foreground" fill="currentColor" />
					</View>
				</Pressable>
				{dialog}
			</>
		)
	}
	return (
		<>
			{/* a row's pill, drawn as the play pill beside it, or a film card's play button, the play button at the film
			    player's size, centered in the 3:2 frame of the card's image. only the button takes the press, so the
			    image around it opens the page. it shows play at all times, and the view around it is what the sheet
			    returns focus to */}
			{size === "pill" ? (
				<TextClassContext.Provider value="text-link">
					<Pressable
						ref={buttonRef}
						accessibilityRole="button"
						accessibilityLabel={label}
						hitSlop={toTouchTargetHitSlop(24)}
						className={`${IDLE_PODCAST_EPISODE_PILL_CLASS} shrink-0 flex-row active:opacity-75`}
						onPress={handlePress}
					>
						<Icon as={Clapperboard} className="size-3" strokeWidth={2.5} />
						<Text className="text-xs font-semibold">{label}</Text>
					</Pressable>
				</TextClassContext.Provider>
			) : (
				<View pointerEvents="box-none" className="absolute inset-x-0 top-0 aspect-[3/2] items-center justify-center">
					<View ref={buttonRef} collapsable={false}>
						<PodcastEpisodePlayButton
							podcastEpisode={podcastEpisode}
							size="lg"
							label={label}
							isPlaying={false}
							onPress={onPress}
						/>
					</View>
				</View>
			)}
			{dialog}
		</>
	)
}
