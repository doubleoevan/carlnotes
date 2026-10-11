// the billing subscriptions table
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { billingInterval, plan, primaryId, timestamps } from "./columns"
import { users } from "./users"

// a billing subscription is a user's active paid Stripe subscription.
export const billingSubscriptions = pgTable("billing_subscriptions", {
	id: primaryId(),
	// the subscriber. one active billing subscription per user, so the user id is unique and cascades with the user
	userId: text("user_id")
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: "cascade" }),
	// the Stripe customer and subscription this row mirrors
	stripeCustomerId: text("stripe_customer_id").notNull(),
	stripeSubscriptionId: text("stripe_subscription_id").notNull(),
	// the plan this subscription grants, the Stripe status it mirrors, and when the current period ends
	plan: plan("plan").notNull(),
	status: text("status").notNull(),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
	// whether Stripe has a payment method, and how often this subscription bills. only monthly includes metered overage
	hasPaymentMethod: boolean("has_payment_method").notNull().default(false),
	billingInterval: billingInterval("interval").notNull().default("monthly"),
	// created and updated timestamps
	...timestamps(),
})
