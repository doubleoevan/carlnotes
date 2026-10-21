-- one subscription row per user and topic, so a concurrent double subscribe cannot insert twice.
-- audience rows carry a null subscriber_user_id, which the index treats as distinct, so they are unaffected
CREATE UNIQUE INDEX "subscriptions_topic_subscriber_unique" ON "subscriptions" USING btree ("topic_id","subscriber_user_id");