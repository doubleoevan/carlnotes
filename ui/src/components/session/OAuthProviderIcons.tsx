// oauth provider icons. GitHub's icon comes from simple-icons, and Google's icon stays drawn here
import { BrandIcon } from "@/components/common/BrandIcon"

/**
 * The Google "G" mark
 */
export function GoogleIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className={className}>
			<path
				fill="#4285F4"
				d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
			/>
			<path
				fill="#34A853"
				d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24Z"
			/>
			<path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.27a12 12 0 0 0 0 10.76l4-3.1Z" />
			<path
				fill="#EA4335"
				d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.43-3.43C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75Z"
			/>
		</svg>
	)
}

/**
 * The GitHub octocat mark
 */
export function GithubIcon({ className }: { className?: string }) {
	return <BrandIcon brand="github" className={className} />
}
