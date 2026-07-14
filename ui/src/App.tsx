import type { JSX } from "react"
import { Card, CardContent } from "@/components/ui/card"

/**
 * The root component of the application
 */
export function App(): JSX.Element {
	// Render the placeholder card centered on the page.
	return (
		<div className="container mx-auto p-8 text-center">
			<Card>
				<CardContent>Hello!</CardContent>
			</Card>
		</div>
	)
}
