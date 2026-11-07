# Spec Delta

## ADDED Requirements

### Requirement: Reactions, comments, and reports have flat daily limits per account

Each account SHALL save at most 200 Reactions, post at most 200 Comments, replies and edits included, and send at
most 50 reports in a day. The limits SHALL NOT vary with the account's age or plan. Each count SHALL live in the Redis
store, so every api replica counts against one number, and a deleted Reaction or Comment SHALL still count. A request
past a limit SHALL be rejected with a 429 and SHALL store nothing. The MCP tools SHALL count against the same limits
as the routes.

#### Scenario: The 201st Reaction of the day is rejected

- **WHEN** an account that saved 200 Reactions today saves another
- **THEN** the save is rejected with a 429 and nothing is stored

#### Scenario: Saving and deleting does not reset the count

- **WHEN** an account saves and deletes a Reaction 200 times in a day and then saves again
- **THEN** the save is rejected with a 429

#### Scenario: A new account has the same limit

- **WHEN** an account created today posts its tenth Comment
- **THEN** the Comment is stored, as it is for an account of any age

#### Scenario: A tool call counts with the route

- **WHEN** an account posts 150 Comments on the site and 50 through `post_hot_take` in one day, then posts one more
- **THEN** the last post is rejected with a 429 wherever it was sent

#### Scenario: An edit counts with the posts

- **WHEN** an account that posted 150 Comments today makes 50 edits and then posts one more
- **THEN** the last post is rejected with a 429

### Requirement: Reaction and comment reads are paged and limited per caller

The paged reads of a comment thread and of a Comment's replies, the reaction summary, and the mention suggestions
SHALL return a fixed page size that no request changes, and SHALL be limited per minute by the signed-in user, or by
the client address for a request with no session. The limit SHALL be far above what a person reading a page sends.

#### Scenario: A page size cannot be raised

- **WHEN** a request asks a thread for 500 Comments in one read
- **THEN** it gets one page of 20

#### Scenario: A visitor's address is limited

- **WHEN** one address with no session sends more thread reads in a minute than the limit
- **THEN** the reads past the limit are rejected with a 429, and a second address is unaffected

### Requirement: A social route bounds its inputs

A cursor that does not parse SHALL read as a first page. A NUL in a path, a query, or an id SHALL be rejected with a
400.

#### Scenario: A cursor that does not parse reads as a first page

- **WHEN** a thread read sends a cursor that does not parse
- **THEN** it returns the thread's first page

#### Scenario: A NUL is a 400

- **WHEN** a request holds a NUL in its path, its query, or an id
- **THEN** it is rejected with a 400, and nothing is read or stored
