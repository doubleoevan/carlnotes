## 1. The card for every episode

- [x] 1.1 Serve the episode head and the episode card image for any published episode, and give a private or invite
  Topic's episode head its card alone, with no canonical url, structured data, feed, or audio
- [x] 1.2 Export the any-visibility episode lookups, add a lookup by id, and remove the public-only lookup
- [x] 1.3 Test that an invite Topic's episode head has its card and nothing for search engines

## 2. The gate

- [x] 2.1 Answer an invite Topic's non-member on the episode page route with the gate's 403 and the Topic's name
- [x] 2.2 Move the invite-only gate into `TopicGateNotice`, and show it on the episode page over its skeleton, returning a
  sign up to the episode
- [x] 2.3 Update the episode smoke check for the gated page, and check the card, the head, and the gate on the local stack
- [x] 2.4 Gate a private Topic and its episodes with the private notice, Log in alone, and no name in the api's answer,
  as the topic-detail-page spec requires
- [x] 2.5 Scope the topic-detail-page rule on a private Topic's name to the gated page's content, since every page's
  head has its card
- [x] 2.6 Read the gate for the topic page and the episode page through one `readTopicGate`, and test it
- [x] 2.7 Smoke the private Topic's episode gate for a visitor and a non-member, its owner's page, its card, and the
  topic gates, and check the late subscriber's episode page while the subscriber still follows the topic
