// the links a session screen draws: a text link to a route, and the footer line that leads to the other form
import { type Href, Link } from "expo-router"
import { Text, View } from "react-native"
import { toTypeRoleStyle } from "../../typeRoleStyles"

/**
 * A text link to another screen, the one way a screen links to a route.
 */
export function SessionTextLink({ label, href }: { label: string; href: Href }) {
	return (
		<Link href={href} accessibilityRole="link" accessibilityLabel={label}>
			<Text style={toTypeRoleStyle("body")} className="text-link underline">
				{label}
			</Text>
		</Link>
	)
}

/**
 * The line under a session form that leads to the other one: a prompt and a link.
 */
export function SessionFooterLink({ prompt, linkLabel, href }: { prompt: string; linkLabel: string; href: Href }) {
	return (
		<View className="mt-4 flex-row justify-center gap-1">
			<Text style={toTypeRoleStyle("body")} className="text-muted-foreground">
				{prompt}
			</Text>
			<SessionTextLink label={linkLabel} href={href} />
		</View>
	)
}
