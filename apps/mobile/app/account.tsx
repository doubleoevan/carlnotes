import { authClient } from "@carlnotes/client/authClient"
import { toDashboardPageLinks } from "@carlnotes/contracts/dashboards"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { AvatarHeader, AvatarHeaderSkeleton } from "@carlnotes/core/components/AvatarHeader"
import { useAccount } from "@carlnotes/core/hooks/useAccount"
import { CircleDollarSign, Settings, User } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { AccountBudget } from "@/components/account/AccountBudget"
import { AccountPlan } from "@/components/account/AccountPlan"
import { AccountSettings } from "@/components/account/AccountSettings"
import { AppVersionLine } from "@/components/account/AppVersionLine"
import { AccordionSection } from "@/components/common/AccordionSection"
import {
	MOBILE_AVATAR_HEADER_ELEMENTS,
	MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS,
} from "@/components/common/avatarHeaderElements"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { MenuLink } from "@/components/layout/MenuLink"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { TableCard } from "@/components/table/TableCard"

/**
 * Loads the signed-in account's billing and activity with the same settings as the web account.
 */
export default function AccountScreen() {
	// isolate account data and refresh the complete budget together
	const { data: session } = authClient().useSession()
	const query = useAccount({ userId: session?.user.id })

	// the budget and settings sections, both open at first like the web's
	const [isBudgetExpanded, setIsBudgetExpanded] = useState(true)
	const [isSettingsExpanded, setIsSettingsExpanded] = useState(true)

	// the signed-in user's three Dashboard pages
	const dashboardPageLinks = session ? toDashboardPageLinks(session.user.id) : null
	return (
		<PageScreen
			title="Account"
			icon={User}
			action={<AccountPlan billing={query.data?.billing} isLoadFailed={query.isError} />}
			byline={
				session ? (
					<AvatarHeader
						subject={{ subjectKind: "user", user: toSessionProfileIdentity(session.user) }}
						elements={MOBILE_AVATAR_HEADER_ELEMENTS}
					/>
				) : (
					<AvatarHeaderSkeleton elements={MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS} />
				)
			}
			onRefresh={() => void query.refetch()}
			isRefreshing={query.isRefetching}
		>
			{/* the budget and the settings as expandable sections, which draw their own side insets */}
			<View className="-mx-4">
				<AccordionSection
					title="Budget"
					icon={CircleDollarSign}
					isExpanded={isBudgetExpanded}
					onToggle={() => setIsBudgetExpanded(!isBudgetExpanded)}
				>
					<View className={SECTION_CONTENT_CLASS}>
						{query.data ? (
							<AccountBudget {...query.data} />
						) : query.isError ? (
							<LoadFailedNotice
								message="Account didn't load."
								retryLabel="Retry loading account"
								onRetry={() => void query.refetch()}
							/>
						) : (
							// an admin's own budget lists no monthly budget cutoffs unless it has an override
							<PageSkeleton kind="account" hasMonthlyBudgetCutoffs={!isAdminRole(session?.user.role)} />
						)}
					</View>
				</AccordionSection>
				{/* the three Dashboard rows, as the user menu draws them */}
				{dashboardPageLinks && (
					<TableCard className="mx-4 mb-6 p-2">
						{dashboardPageLinks.map(({ dashboardKind, label, path }) => (
							<MenuLink key={dashboardKind} label={label} href={path} isSelected={false} />
						))}
					</TableCard>
				)}
				<AccordionSection
					title="Settings"
					icon={Settings}
					isExpanded={isSettingsExpanded}
					isContentKept
					onToggle={() => setIsSettingsExpanded(!isSettingsExpanded)}
				>
					<View className={SECTION_CONTENT_CLASS}>
						<AccountSettings provider={query.data?.billing.provider ?? null} />
					</View>
				</AccordionSection>
			</View>
			{/* app version */}
			<AppVersionLine />
		</PageScreen>
	)
}

// a section's content with the side insets the sections draw and the web's spacing under an open section
const SECTION_CONTENT_CLASS = "mx-4 gap-6 pt-2 pb-6"
