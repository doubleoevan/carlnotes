import { YOUTUBE_PLAY_TRIANGLE_PATH } from "@carlnotes/contracts/youtube"
import { Path } from "react-native-svg"
import { siYoutube } from "simple-icons"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { ClassNameSvg } from "./ClassNameSvg"

/**
 * Shows YouTube's red play button at the user's text scale.
 */
export function YoutubePlayIcon({ size = 16 }: { size?: number }) {
	const iconSize = useFontScaledSize(size)
	return (
		<ClassNameSvg width={iconSize} height={iconSize} viewBox="-2 -2 28 28" accessible={false}>
			<Path d={siYoutube.path} fill={`#${siYoutube.hex}`} />
			<Path d={YOUTUBE_PLAY_TRIANGLE_PATH} fill="white" />
		</ClassNameSvg>
	)
}
