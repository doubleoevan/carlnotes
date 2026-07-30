// oauth provider marks. lucide-react dropped brand logos, so these are small standalone svgs

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
	return (
		<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.03-1.61-4.03-1.61-.55-1.38-1.33-1.76-1.33-1.76-1.09-.74.08-.72.08-.72 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.53.12-3.19 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.02 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.89.12 3.19.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.56 21.8 24 17.29 24 12c0-6.63-5.37-12-12-12Z" />
		</svg>
	)
}
