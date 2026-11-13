// the account MCP view: the caller's budget, as the account page's Budget section shows it
import { isPaidPlan } from "@carlnotes/contracts/enums"
import type { McpViewAccount } from "@carlnotes/contracts/mcpViews"
import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { AccountBudget, type AccountBudgetElements } from "@carlnotes/core/components/AccountBudget"
import { AccountPlan } from "@carlnotes/core/components/AccountPlan"
import { AvatarHeader } from "@carlnotes/core/components/AvatarHeader"
import { cn } from "@carlnotes/nightshift/classNames"
import { CircleDollarSign, Columns3Cog, Settings, User } from "lucide-react"
import { ACCOUNT_BUDGET_LAYOUT_ELEMENTS, PaymentNoticeCard } from "@/components/account/AccountBudget"
import { ACCOUNT_PLAN_ELEMENTS } from "@/components/account/AccountPlan"
import { SpendMeter } from "@/components/account/SpendMeter"
import { AccordionSection } from "@/components/common/AccordionSection"
import { AnchorLink } from "@/components/common/AnchorLink"
import { WEB_AVATAR_HEADER_ELEMENTS } from "@/components/common/avatarHeaderElements"
import { Accordion } from "@/components/primitives/accordion"
import {
	HIGHLIGHTED_PAGE_BUTTON_CLASS,
	PAGE_HEADER_CLASS,
	PAGE_TITLE_CLASS,
	SECTIONS_UNDER_AVATAR_HEADER_CLASS,
} from "@/lib/styleClasses"
import { useMcpViewData } from "./mcpViewHost"

// the account page on the site, where a paid user manages the plan and its payment
const ACCOUNT_PATH = "/account"

/**
 * The account MCP view: the account page's heading, the caller's avatar header, and its Budget section. The plan
 * button and the payment notice's Update open the site's plans page or account page. The Settings section stays on the
 * site.
 */
export function AccountMcpView({ mcpViewAccount: { billing, spendMeter } }: { mcpViewAccount: McpViewAccount }) {
	const { session } = useMcpViewData()
	return (
		<div>
			{/* the page's title with the same icon as its header menu item, and the plan with its link to the right */}
			<div className={PAGE_HEADER_CLASS}>
				<h1 className={PAGE_TITLE_CLASS}>
					<User className="size-6" />
					Account
				</h1>
				<AccountPlan
					billing={billing}
					isLoadFailed={false}
					planAction={<McpViewPlanLink billing={billing} />}
					elements={ACCOUNT_PLAN_ELEMENTS}
				/>
			</div>
			{session && (
				<AvatarHeader subject={{ subjectKind: "user", user: session }} elements={WEB_AVATAR_HEADER_ELEMENTS} />
			)}
			{/* the budget as the page's expandable section */}
			<Accordion type="multiple" defaultValue={["budget"]} className={SECTIONS_UNDER_AVATAR_HEADER_CLASS}>
				<AccordionSection value="budget" title="Budget" icon={CircleDollarSign}>
					<div className="space-y-6 pt-2 pb-4">
						<AccountBudget
							billing={billing}
							activity={spendMeter}
							spendMeter={<SpendMeter {...spendMeter} />}
							elements={MCP_VIEW_ACCOUNT_BUDGET_ELEMENTS}
						/>
					</div>
				</AccordionSection>
			</Accordion>
		</div>
	)
}

// the page's layout, with a notice whose Update opens the account page on the site
const MCP_VIEW_ACCOUNT_BUDGET_ELEMENTS: AccountBudgetElements = {
	...ACCOUNT_BUDGET_LAYOUT_ELEMENTS,
	PaymentNotice: () => (
		<PaymentNoticeCard
			updateControl={
				<AnchorLink href={ACCOUNT_PATH} className={cn(HIGHLIGHTED_PAGE_BUTTON_CLASS, "mt-1")}>
					Update
				</AnchorLink>
			}
		/>
	),
}

// a paid user's link to manage the plan on the account page, and a free user's link to the plans page
function McpViewPlanLink({ billing }: { billing: BillingState }) {
	if (isPaidPlan(billing.plan)) {
		return (
			<AnchorLink href={ACCOUNT_PATH} className={HIGHLIGHTED_PAGE_BUTTON_CLASS}>
				<Settings className="size-4" />
				{PURCHASE_COPY.managePlan}
			</AnchorLink>
		)
	}
	return (
		<AnchorLink href={PLANS_PATH} className={HIGHLIGHTED_PAGE_BUTTON_CLASS}>
			<Columns3Cog className="size-4" />
			{PURCHASE_COPY.upgrade}
		</AnchorLink>
	)
}
