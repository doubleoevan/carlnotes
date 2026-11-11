# Spec Delta

## Purpose

A signed-in reader asks Carl about one Topic Post in a private chat that the chat launcher opens on the post's page.
The chat reads the post and its shared Comments, as the topic chat reads a Topic and the podcast chat reads a chapter.

## ADDED Requirements

### Requirement: A Topic Post has a private chat with Carl

While a published Topic Post's page is open, the chat launcher SHALL open the chat about the post, the Topic's private
chat, for a signed-in user, ahead of every chat room, and its question box SHALL invite a question about the post. A
visitor's press SHALL ask them to sign up and return them to the post. Every other page SHALL keep the launcher's
default. A question that names a Topic Post that is a draft, deleted, or on another Topic SHALL be rejected before any
model call.

#### Scenario: The chat launcher opens the post's chat

- **WHEN** a member of a team that holds the Topic presses the chat launcher on a Topic Post's page
- **THEN** the Topic's private chat opens on that post instead of the team's chat room, and the question box reads
  "Ask me for a hot take on this post"

#### Scenario: A visitor is asked to sign up

- **WHEN** a visitor presses the chat launcher on a Topic Post's page
- **THEN** the sign-up prompt shows, and signing up returns them to the post

#### Scenario: A follower asks about a post

- **WHEN** a signed-in follower asks a question in a public Topic's Topic Post chat
- **THEN** Carl answers from the post, and nobody else sees the exchange

#### Scenario: A post on another Topic is rejected

- **WHEN** a chat request on one Topic names a Topic Post of another
- **THEN** it is rejected as not found and no model call runs

### Requirement: A Topic Post chat turn reads the post and its shared Comments

A Topic Post chat turn SHALL give the model the Topic Post's title and text and the post's Comments that are shared
with Carl and Vienna, each fenced as untrusted data. It SHALL read no unshared Comment and no shared Comment by an
author under an admin block or in a block with the user. An answer that draws on a Comment SHALL credit its author by
username.

#### Scenario: Carl answers what people said

- **WHEN** a user asks what readers made of the post and one shared Comment exists
- **THEN** the answer draws on that Comment and names its author's username

#### Scenario: An unshared Comment is not read

- **WHEN** a Topic Post has only unshared Comments
- **THEN** the chat turn's context holds the post and no Comment

### Requirement: A Topic Post chat turn binds no Topic Tool

A Topic Post chat turn SHALL bind no Topic Tool and SHALL propose no edit, whatever the user's role on the Topic.

#### Scenario: An owner asks for an edit in the post's chat

- **WHEN** a Topic's owner asks the Topic Post chat to change the Topic's prompt
- **THEN** Carl answers in text, and no proposal is stored and nothing is saved

### Requirement: The exchange is metered and saved in the Topic's private chat with a tag

A Topic Post chat turn SHALL be metered and stored as every chat turn is, with a kind of its own that names the Topic
Post. It SHALL show in the user's private chat of the Topic with a tag naming the post, on a reload and on another
device. Deleting the Topic Post SHALL keep the spend and drop the tag's link.

#### Scenario: The exchange shows in the Topic's chat

- **WHEN** a user asks a question on a Topic Post's page and then opens the Topic's private chat
- **THEN** the exchange is there with a tag naming the post

#### Scenario: A spent budget stops the question

- **WHEN** a user whose monthly spend is exhausted sends a question
- **THEN** the chat turn is rejected as every chat turn is, and no model call runs

### Requirement: One chat component serves the post on the web and in the mobile app

The Topic Post chat SHALL be the chat panel the Topic's private chat uses, one shared component that the web and the
mobile app render through a platform adapter. The server SHALL send `social_topic_post_chat` for each turn, with the
Topic Post's id, its Topic's id, and whether the user owns the Topic, and no text.

#### Scenario: A chat turn is counted

- **WHEN** a user sends a question in a Topic Post's chat
- **THEN** one `social_topic_post_chat` event is sent with the two ids and no question text
