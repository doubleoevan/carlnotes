## Why

An admin can open any invite Topic and sees its Follow control, but pressing it fails: the subscription write asks the raw visibility check instead of the gate that carries the admin override, so the api rejects the very action the page just offered. An admin who wants a Topic in their own feed has no way to put it there, and the control lies about what it will do.

## What Changes

- The subscription write authorizes through the same gate every other capability asks, so an admin may subscribe to any invite Topic without being invited to it.
- The rules that sit above that check are unchanged: nobody subscribes to a private Topic, and nobody subscribes to a Topic they own.
- An admin's subscription is an ordinary subscription. It counts toward the Topic's subscriber count, carries the same email preference, and shows the same activation-forward Findings rule that every other invite subscriber gets.

## Capabilities

### Modified Capabilities
- `authorization`: the admin override reaches subscribing, not only viewing and editing.
- `topic-publishing`: an invite Topic can be subscribed to by an admin as well as by an invitee.

## Impact

- `api/topic/subscriptions.ts`: `setTopicSubscription` asks `isAllowed(user, "topic:view", topic)` rather than `canSeeTopic` directly.
- No schema change, no new capability, and no UI change: the Follow control already renders for an admin on an invite Topic, and its tooltip already carries the next-scan expectation.
