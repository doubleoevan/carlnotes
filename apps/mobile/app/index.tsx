// the home screen: the name in the display font, the user's name and avatar, the palette swatches, and one
// public read through the typed client
import { toApiUrl } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { searchSite } from "@carlnotes/client/searchClient"
import { AVATAR_COLOR, toAvatarImagePath, toAvatarInitials, toAvatarTint } from "@carlnotes/contracts/avatars"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import { useAvatar } from "@carlnotes/core/hooks/useAvatar"
import { useNow } from "@carlnotes/core/hooks/useNow"
import { useQuery } from "@tanstack/react-query"
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { SessionTextLink } from "@/components/session/SessionLink"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// the avatar's size on the home screen, in points
const AVATAR_SIZE = 44

// the swatches the screen shows. tailwind reads only literal class names, so each swatch spells out its own
const PALETTE_SWATCHES = [
	{ tokenName: "background", className: "bg-background" },
	{ tokenName: "card", className: "bg-card" },
	{ tokenName: "muted", className: "bg-muted" },
	{ tokenName: "secondary", className: "bg-secondary" },
	{ tokenName: "primary", className: "bg-primary" },
	{ tokenName: "accent", className: "bg-accent" },
	{ tokenName: "destructive", className: "bg-destructive" },
	{ tokenName: "hero", className: "bg-hero" },
	{ tokenName: "badge", className: "bg-badge" },
	{ tokenName: "link", className: "bg-link" },
] as const

// the fixed public search the screen proves the client with
const SEARCH_QUERY = "coffee"

export default function HomeScreen() {
	// the clock from the shared core package. a second React in the bundle would fail this hook loudly
	const now = useNow()

	// one public read through the typed client
	const topicSearch = useQuery({
		queryKey: ["siteSearch", SEARCH_QUERY],
		queryFn: () => searchSite(searchRequestPayload.parse({ q: SEARCH_QUERY, kinds: ["topics"] })),
	})

	return (
		<View className="flex-1 bg-background">
			<ClassNameSafeAreaView className="flex-1">
				<ScrollView contentContainerClassName="gap-6 p-4">
					{/* the name and a body line, one in each family */}
					<Text style={toTypeRoleStyle("display")} className="text-foreground" accessibilityRole="header">
						CarlNotes
					</Text>
					<SignedInUserRow />
					<Text style={toTypeRoleStyle("body")} className="text-muted-foreground">
						{"The mobile app, wired end to end: the Nightshift theme, the fonts, and the api client. As of "}
						{new Date(now).toLocaleTimeString()}
						{"."}
					</Text>

					{/* the palette swatches in the current mode */}
					<View>
						<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
							Palette
						</Text>
						<View className="mt-2 flex-row flex-wrap gap-3">
							{PALETTE_SWATCHES.map((paletteSwatch) => (
								<View key={paletteSwatch.tokenName} className="items-center gap-1">
									<View className={`h-12 w-12 rounded-lg border border-border ${paletteSwatch.className}`} />
									<Text style={toTypeRoleStyle("caption")} className="text-muted-foreground">
										{paletteSwatch.tokenName}
									</Text>
								</View>
							))}
						</View>
					</View>

					{/* the public read, with its loading and error states */}
					<View>
						<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
							Public topics
						</Text>
						{topicSearch.isPending && (
							<View className="mt-2 flex-row items-center gap-2">
								<ActivityIndicator />
								<Text style={toTypeRoleStyle("body")} className="text-muted-foreground">
									Loading the site search…
								</Text>
							</View>
						)}
						{topicSearch.isError && (
							<View className="mt-2 gap-2">
								<Text style={toTypeRoleStyle("body")} className="text-destructive">
									The api is not reachable right now.
								</Text>
								<Pressable
									accessibilityRole="button"
									accessibilityLabel="Try the search again"
									className="min-h-11 items-center justify-center self-start rounded-lg bg-primary px-4"
									onPress={() => topicSearch.refetch()}
								>
									<Text style={toTypeRoleStyle("label")} className="text-primary-foreground">
										Try again
									</Text>
								</Pressable>
							</View>
						)}
						{topicSearch.isSuccess && topicSearch.data.rows.length === 0 && (
							<Text style={toTypeRoleStyle("body")} className="mt-2 text-muted-foreground">
								{`No public topics matched "${SEARCH_QUERY}".`}
							</Text>
						)}
						{topicSearch.isSuccess && topicSearch.data.rows.length > 0 && (
							<View className="mt-2 gap-2">
								{topicSearch.data.rows.map((searchRow) => (
									<View key={searchRow.id} className="rounded-lg bg-card p-3">
										<Text style={toTypeRoleStyle("label")} className="text-card-foreground">
											{searchRow.name}
										</Text>
									</View>
								))}
							</View>
						)}
					</View>
				</ScrollView>
			</ClassNameSafeAreaView>
		</View>
	)
}

// the user's avatar and name from the session, with the link to the settings screen
function SignedInUserRow() {
	const { data: session } = authClient().useSession()
	const { avatarVersion } = useAvatar()
	if (!session) {
		return null
	}

	// the avatar at the session's version, or the initials on the tint the web draws
	const { id: userId, name, username } = session.user
	const avatarImageUrl = avatarVersion === null ? null : toApiUrl(toAvatarImagePath(userId, avatarVersion))
	return (
		<View className="flex-row items-center gap-3">
			{avatarImageUrl ? (
				<Image
					source={{ uri: avatarImageUrl }}
					accessibilityLabel={`${username}'s avatar`}
					style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
				/>
			) : (
				<View
					accessibilityLabel={`${username}'s avatar`}
					className="items-center justify-center rounded-full"
					style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, backgroundColor: toAvatarTint(userId) }}
				>
					<Text style={[toTypeRoleStyle("label"), { color: AVATAR_COLOR }]}>{toAvatarInitials(username)}</Text>
				</View>
			)}
			<View className="flex-1">
				<Text style={toTypeRoleStyle("label")} className="text-foreground">
					{name || username}
				</Text>
				<Text style={toTypeRoleStyle("caption")} className="text-muted-foreground">
					@{username}
				</Text>
			</View>
			<SessionTextLink label="Settings" href="/settings" />
		</View>
	)
}
