import { authClient } from "@carlnotes/client/authClient"
import { sendDeleteAccount } from "@carlnotes/client/profileClient"
import { type BillingProvider, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import { SITE_URL } from "@carlnotes/contracts/site"
import { STORE_NAMES } from "@carlnotes/contracts/storeBilling"
import {
	EmailSection,
	InvitationsSection,
	PasswordSection,
	ProfileFields as SharedProfileFields,
} from "@carlnotes/core/components/AccountFields"
import { BlockedUsersSection } from "@carlnotes/core/components/BlockedUsersSection"
import { NotificationsSection } from "@carlnotes/core/components/NotificationsSection"
import { capitalize } from "@carlnotes/core/lib/labels"
import { CLOSE_ACCOUNT_CONFIRMATION, REQUEST_FAILED_TEXT, toCloseAccountCopy } from "@carlnotes/core/lib/sessionCopy"
import { PLAN_MANAGEMENT_LABELS } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { Settings } from "lucide-react-native"
import { useState } from "react"
import { Alert, Linking, View } from "react-native"
import { mobileAuthClient, retireCurrentSession } from "@/authClient"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { useApplyStoreBilling } from "@/hooks/useStoreBilling"
import { askForPushPermission, usePushPermission } from "@/pushPermission"
import { isStorePurchasesConfigured, openPlanManagement, restoreStorePurchases, STORE_PROVIDER } from "@/storePurchases"
import { ACCOUNT_FIELD_ELEMENTS, BLOCKED_USERS_ELEMENTS, PROFILE_FIELD_ELEMENTS } from "./AccountFields"

/**
 * Shows every web account setting using shared forms and native profile and session adapters, plus the phone's
 * Notifications and Restore purchases sections, which the web has no counterpart for. The billing provider names the
 * store where a store subscriber cancels the plan.
 */
export function AccountSettings({ provider }: { provider: BillingProvider | null }) {
	return (
		<>
			<View className="flex-row items-center gap-2">
				<Icon as={Settings} className="size-5 text-foreground" />
				<Text accessibilityRole="header" className="font-display text-xl">
					Settings
				</Text>
			</View>
			<View className="rounded-lg border border-separator bg-card p-4 shadow-raised">
				<Text className="font-semibold">Profile</Text>
				<ProfileFields />
			</View>
			<EmailSection elements={ACCOUNT_FIELD_ELEMENTS} callbackURL={`${SITE_URL}/account`} />
			<PasswordSection elements={ACCOUNT_FIELD_ELEMENTS} />
			<InvitationsSection elements={ACCOUNT_FIELD_ELEMENTS} />
			<PushNotificationsSection />
			{isStorePurchasesConfigured() && <RestorePurchasesSection />}
			<BlockedUsersSection elements={BLOCKED_USERS_ELEMENTS} />
			<DeleteAccountSection provider={provider} />
		</>
	)
}

/**
 * Shares profile editing between the native account and profile screens.
 */
export function ProfileFields({ onUsernameChanged }: { onUsernameChanged?: () => void }) {
	// read the active account before mounting the shared profile form
	const { data: session } = authClient().useSession()
	if (!session) {
		return null
	}
	return (
		<SharedProfileFields
			key={session.user.id}
			elements={PROFILE_FIELD_ELEMENTS}
			avatar={<UserAvatarPicker userId={session.user.id} username={session.user.username} />}
			username={session.user.username}
			className="mt-3"
			onUsernameChanged={onUsernameChanged}
		/>
	)
}

// the shared Notifications section over the phone's own permission: asking for it, and the system settings after a
// refusal. nothing renders until the first permission read
function PushNotificationsSection() {
	const pushPermission = usePushPermission()
	if (!pushPermission) {
		return null
	}
	return (
		<NotificationsSection
			elements={ACCOUNT_FIELD_ELEMENTS}
			pushPermission={pushPermission}
			onRequestPermission={() => void askForPushPermission()}
			onOpenSettings={() => void Linking.openSettings()}
		/>
	)
}

/**
 * Shows Restore purchases, which restores the store account's purchases to the signed-in user.
 */
export function RestorePurchasesSection() {
	const { data: session } = authClient().useSession()
	const applyStoreBilling = useApplyStoreBilling()
	const [isRestoring, setIsRestoring] = useState(false)

	// restore to the signed-in user, show the synced plan, and say whether the store held one
	async function handleRestore(): Promise<void> {
		if (!session) {
			return
		}
		setIsRestoring(true)
		try {
			const { billing, isRestored } = await restoreStorePurchases()
			applyStoreBilling(billing)
			Alert.alert(
				PURCHASE_COPY.restorePurchases,
				isRestored ? `Your ${capitalize(billing.plan)} plan is restored.` : "No plan was found to restore.",
			)
		} catch (error) {
			console.error("store restore failed", error)
			Alert.alert(PURCHASE_COPY.restorePurchases, REQUEST_FAILED_TEXT)
		} finally {
			setIsRestoring(false)
		}
	}
	return (
		<View className="gap-3 rounded-lg border border-separator bg-card p-4 shadow-raised">
			<Text className="font-semibold">{PURCHASE_COPY.restorePurchases}</Text>
			<Text className="text-sm text-muted-foreground">
				{`Bought a plan in ${STORE_NAMES[STORE_PROVIDER]} on another phone or before a reinstall? Restore it to this account.`}
			</Text>
			<Button
				variant="outline"
				className="self-start"
				accessibilityLabel={PURCHASE_COPY.restorePurchases}
				disabled={isRestoring}
				onPress={() => void handleRestore()}
			>
				<Text>{PURCHASE_COPY.restorePurchases}</Text>
			</Button>
		</View>
	)
}

/**
 * Closes the account only after confirmation and retires its local data before leaving the session. A store
 * subscriber is told the store keeps billing, with the store's page beside the button.
 */
export function DeleteAccountSection({ provider }: { provider: BillingProvider | null }) {
	const { storeProvider, sectionText, confirmationBody } = toCloseAccountCopy(provider)
	const [isClosing, setIsClosing] = useState(false)
	const [error, setError] = useState<string | null>(null)
	async function handleDelete(): Promise<void> {
		setIsClosing(true)
		setError(null)
		try {
			await sendDeleteAccount()
			await retireCurrentSession()
			await mobileAuthClient.signOut()
		} catch {
			setError(REQUEST_FAILED_TEXT)
		} finally {
			setIsClosing(false)
		}
	}
	return (
		<View className="gap-3 rounded-lg border border-destructive bg-card p-4">
			<Text className="font-semibold text-destructive">Close your account</Text>
			<Text className="text-sm text-muted-foreground">{sectionText}</Text>
			{error && <Text className="text-sm text-destructive">{error}</Text>}
			<View className="flex-row flex-wrap gap-2">
				<Button
					variant="destructive"
					accessibilityLabel="Close account"
					disabled={isClosing}
					onPress={() =>
						Alert.alert(CLOSE_ACCOUNT_CONFIRMATION.title, confirmationBody, [
							{ text: CLOSE_ACCOUNT_CONFIRMATION.cancelLabel, style: "cancel" },
							...(storeProvider
								? [
										{
											text: PLAN_MANAGEMENT_LABELS[storeProvider],
											onPress: () => void openPlanManagement(storeProvider),
										},
									]
								: []),
							{
								text: CLOSE_ACCOUNT_CONFIRMATION.confirmLabel,
								style: "destructive" as const,
								onPress: () => void handleDelete(),
							},
						])
					}
				>
					<Text>Close account</Text>
				</Button>
				{/* the store's subscription page, where a store plan is canceled */}
				{storeProvider && (
					<Button
						variant="outline"
						accessibilityLabel={PLAN_MANAGEMENT_LABELS[storeProvider]}
						onPress={() => void openPlanManagement(storeProvider)}
					>
						<Text>{PLAN_MANAGEMENT_LABELS[storeProvider]}</Text>
					</Button>
				)}
			</View>
		</View>
	)
}
