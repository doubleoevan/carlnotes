---
title: Plans and limits
description: >-
  What each plan includes and costs, how overage and the coffee fund work, and what happens
  to your topics when you downgrade or close your account.
sidebar:
  order: 1
---

CarlNotes plans are built around brew volume. Every brew fetches pages and runs models,
and both cost real money. The plans track the part that costs: how many topics you run, how often
they brew, and how many brews you can run by hand in a day.

## The plans

| | Free | Plus | Premium |
|---|---|---|---|
| Price, monthly billing | $0 | $15/month | $29/month |
| Price, yearly billing | $0 | $150/year | $290/year |
| Topics | 3 | 10 | 25 |
| Topics on a daily schedule | 1 | 3 monthly · 4 yearly | 6 monthly · 7 yearly |
| Brews a day | 5 | 15 monthly · 20 yearly | 30 monthly · 40 yearly |

Yearly billing is ten times the monthly price instead of twelve: two months for free. Yearly plans get higher daily limits
instead of overage, because a yearly subscription has no monthly invoice to bill overage to.

"Topics on a daily schedule" caps how many of your topics run **Daily** or **Weekdays**. Weekly
topics don't count against the daily limit. "Brews a day" is the shared pool for scheduled and manual brews, and
it resets at midnight UTC.

![The plans page: Free, Plus, and Premium side by side with yearly billing
selected](../../../assets/screenshots/billing-plan-picker.png)

## Overage

On a monthly paid plan with a card on file, hitting the daily brew limit doesn't stop you. Manual
brews past the limit keep working and bill per brew as metered overage on your monthly invoice. The
account page says it directly: "Extra scans beyond your daily limit are billed by the scan."

Without a card, and on the free plan, the daily limit is a hard stop until midnight UTC. Yearly
plans don't bill overage; their higher daily limits are the tradeoff.

There is a ceiling. Your account page shows **Carl's coffee fund**: the month's AI model spend against
your plan's monthly cap. The plans page states each cap as an estimate, "About 30, 100, or 200 Brews
a month" for **Free**, **Plus**, and **Premium** plans. If your coffee fund budget fills up, 
your brews are paused until it resets on the first of the month, UTC.

## Track your budget

Go to the **Activity** page. Your topics table has a **Cost** column with a per-topic total for the
month, expandable to show the brews that charged it. The **Cost** column answers "which topics spent the most."

More sources cost more on a **Daily** schedule. Ten sources brewed daily takes
around 300 fetches a month before reviewing even gets started. To fix an expensive topic, move
it to **Weekdays** or **Weekly**, or drop sources whose findings you never open. The Brew
diary's "read N · kept N" counts show which sources earn their keep.

![The activity page's topics table, scrolled to the per-topic Cost column and the monthly
total](../../../assets/screenshots/activity-spend-bar.png)

## Upgrade, downgrade, cancel

**Manage plan** on the account page opens the shopping cart for upgrades and manages the subscription you
have. Canceling puts you back on the free plan's limits.

Downgrading never deletes anything. Every topic, finding, and subscription stays. Two limits
tighten:

- If you're over the topic cap, you can't create new topics until you're back under it. Existing topics keep
  working.
- If you're over the new daily-schedule cap, your oldest daily topics keep their schedule and the newer ones
  stop brewing automatically. They keep their findings and still brew manually. A **Weekly**
  schedule removes them from the daily cap entirely.

## Closing your account

**Close account** is at the bottom of the account page. The page states the terms exactly: "Your
topics, findings, subscriptions, and chats are removed with it. Any paid plan is canceled. This cannot be
undone."
