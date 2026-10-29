// the oauth provider icons the web draws on its sign-in buttons, from the paths Nightshift shares
import {
	APPLE_ICON_PATH,
	googleIconPaths,
	OAUTH_PROVIDER_ICON_VIEW_BOX,
} from "@carlnotes/nightshift/oauthProviderIcons"
import Svg, { Path } from "react-native-svg"
import { siGithub } from "simple-icons"
import { ClassNameSvg } from "@/components/common/ClassNameSvg"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

// the 16 points the web's buttons draw an icon at
const ICON_SIZE = 16

/**
 * The Google "G" mark, in Google's colors.
 */
export function GoogleIcon() {
	const iconSize = useFontScaledSize(ICON_SIZE)
	return (
		<Svg width={iconSize} height={iconSize} viewBox={OAUTH_PROVIDER_ICON_VIEW_BOX} accessibilityElementsHidden>
			{googleIconPaths.map((googleIconPath) => (
				<Path key={googleIconPath.fill} fill={googleIconPath.fill} d={googleIconPath.d} />
			))}
		</Svg>
	)
}

/**
 * The GitHub mark, from the same simple-icons path the web draws, in the text color its className gives.
 */
export function GithubIcon({ className }: { className?: string }) {
	const iconSize = useFontScaledSize(ICON_SIZE)
	return (
		<ClassNameSvg
			className={className}
			width={iconSize}
			height={iconSize}
			viewBox="0 0 24 24"
			accessibilityElementsHidden
		>
			<Path d={siGithub.path} fill="currentColor" />
		</ClassNameSvg>
	)
}

/**
 * The Apple logo, in the text color its className gives.
 */
export function AppleIcon({ className }: { className?: string }) {
	const iconSize = useFontScaledSize(ICON_SIZE)
	return (
		<ClassNameSvg
			className={className}
			width={iconSize}
			height={iconSize}
			viewBox={OAUTH_PROVIDER_ICON_VIEW_BOX}
			accessibilityElementsHidden
		>
			<Path d={APPLE_ICON_PATH} fill="currentColor" />
		</ClassNameSvg>
	)
}
