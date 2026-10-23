## ADDED Requirements

### Requirement: A topic's follower count opens its followers

In the console's topics subtable, a Topic's follower count SHALL open that Topic's followers beneath its row. Each
follower's row SHALL show, in the users table's order, their avatar and username linking to their profile, their email
linking to their activity page and their plan linking to their account page as the users table links them, their signup
date, and last login, then when they followed, whether the Topic's emails reach them, how many of the Topic's emails
they received, and when it last emailed them. The followers SHALL be the people the count counts: active subscriptions,
never the owner's own. They SHALL be read when the count is opened, through a route only an admin may call. A Topic row
SHALL show one subtable at a time, its scan costs or its followers. The owner's own topics table SHALL keep a plain
follower count.

#### Scenario: A follower count opens the followers

- **WHEN** an admin activates a Topic's follower count in the console
- **THEN** a table of that Topic's followers renders beneath the row, and the count's marker shows it is open

#### Scenario: A follower's row counts the emails they received

- **GIVEN** a follower the Topic has emailed three times
- **WHEN** an admin opens the Topic's followers
- **THEN** that follower's row reads 3 under Emailed, and the date of the third under Last email

#### Scenario: The list matches the count

- **GIVEN** a Topic whose owner follows it, with two active followers and one who unfollowed
- **WHEN** an admin opens its followers
- **THEN** the count reads 2 and the table lists those two followers

#### Scenario: Followers load on demand

- **WHEN** the console opens a topics subtable
- **THEN** no follower has been read, and the first read happens when a follower count is opened

#### Scenario: A topic with no followers cannot be opened

- **WHEN** a Topic's follower count is zero
- **THEN** the count button is disabled

#### Scenario: Only an admin reads followers

- **WHEN** a signed-out visitor or a user who is not an admin calls the subscribers route
- **THEN** the visitor gets 401, the user gets 403, and no subscriber is read

#### Scenario: The owner's own table keeps a plain count

- **WHEN** a user views their own topics on their profile
- **THEN** the follower count is plain text that opens nothing
