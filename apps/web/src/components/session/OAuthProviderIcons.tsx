// oauth provider icons. GitHub's icon comes from simple-icons, and Google's and Apple's from Nightshift's
// oauthProviderIcons
import { googleIconPaths, OAUTH_PROVIDER_ICON_VIEW_BOX } from "@carlnotes/nightshift/oauthProviderIcons"
import { BrandIcon } from "@/components/common/BrandIcon"

/**
 * The Google "G" mark.
 */
export function GoogleIcon({ className }: { className?: string }) {
	return (
		<svg viewBox={OAUTH_PROVIDER_ICON_VIEW_BOX} width="18" height="18" aria-hidden="true" className={className}>
			{googleIconPaths.map((googleIconPath) => (
				<path key={googleIconPath.fill} fill={googleIconPath.fill} d={googleIconPath.d} />
			))}
		</svg>
	)
}

/**
 * The GitHub octocat mark.
 */
export function GithubIcon({ className }: { className?: string }) {
	return <BrandIcon brand="github" className={className} />
}

/**
 * The Apple logo, in the button's text color.
 */
export function AppleIcon({ className }: { className?: string }) {
	return <BrandIcon brand="apple" className={className} />
}
