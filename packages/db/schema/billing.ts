// the billing subscriptions table
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { billingInterval, billingProvider, plan, primaryId, timestamps } from "./columns"
import { users } from "./users"

// a billing subscription is a user's active paid subscription from Stripe, the App Store, or Google Play
export const billingSubscriptions = pgTable("billing_subscriptions", {
	id: primaryId(),
	// the subscriber. one active billing subscription per user, so the user id is unique and cascades with the user
	userId: text("user_id")
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: "cascade" }),
	// who bills it, and the customer and subscription this row mirrors there. a store row holds RevenueCat's app user
	// id and the store's transaction id. the columns keep their Stripe names from before the stores billed
	provider: billingProvider("provider").notNull().default("stripe"),
	providerCustomerId: text("stripe_customer_id").notNull(),
	providerSubscriptionId: text("stripe_subscription_id").notNull(),
	// the plan this subscription grants, the provider's status it mirrors, and when the current period ends
	plan: plan("plan").notNull(),
	status: text("status").notNull(),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
	// whether the provider has a payment method, and how often this subscription bills
	hasPaymentMethod: boolean("has_payment_method").notNull().default(false),
	billingInterval: billingInterval("interval").notNull().default("monthly"),
	// created and updated timestamps
	...timestamps(),
})
