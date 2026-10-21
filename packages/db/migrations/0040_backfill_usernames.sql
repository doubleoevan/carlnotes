-- gives a username to every user who predates usernames. this is a migration rather than a one-off script so
-- the deploy job that runs migrations runs it too, once per environment, with nothing left to remember.
--
-- the word lists are copied here rather than read from shared/usernameWords.ts on purpose: a migration is a
-- record of what happened, so it must keep working unchanged after those lists are edited.
WITH pairs AS (
	-- every Adjective-Noun combination, which is what signup draws from as well
	SELECT adjective || '-' || noun AS username
	FROM unnest(ARRAY['Rich','Savory','Bold','Aromatic','Designer','Insomniac','Creamy','Uninhibited','Succulent','Flavorful','Roasted','Steeped','Frothy','Velvety','Toasted','Nutty','Smoky','Zesty','Mellow','Robust','Silky','Warm','Bright','DarkRoasted','Intense','Spicy','SlowRoasted','Balanced','Complex','Fruity','Floral','Earthy','Caramelized','Buttery','Chocolatey','Tart','Crisp','ColdBrewed','FrenchPressed','Nocturnal','Caffeinated','Meticulous','WellRead','Prolific','Syrupy','Bittersweet','Delicate','Layered','Unfiltered','Decanted','Iced','Sleepless','Overcaffeinated','Pedantic','Erudite','Eclectic','Metaphysical','Percolating','Relentless','Pontificating','Feisty','Vindicated','Legendary','Punctilious']) AS adjective
	CROSS JOIN unnest(ARRAY['Raccoon','Macchiato','Brew','Note','Espresso','Latte','Ristretto','Americano','Cappuccino','Affogato','Mocha','Kettle','Carafe','Filter','Crema','Bean','Roast','Mug','Saucer','Thermos','Footnote','Reader','NightOwl','Nightcap','Barista','Cortado','FlatWhite','ColdBrew','Drip','Pot','Puppuccino','Clipping','Bandit','Froth','Cupping','Compendium','Tome','Citation','Dossier','Chronicle','Rabbithole','Tangent','Epiphany','Collection','PaperTrail','Singularity','Continuum','Theory']) AS noun
),
free AS (
	-- the combinations nobody holds, shuffled, so the names handed out are not alphabetical
	SELECT username, row_number() OVER (ORDER BY random()) AS position
	FROM pairs
	WHERE lower(replace(replace(username, '-', ''), '_', '')) NOT IN (
		SELECT username_normalized FROM users WHERE username_normalized IS NOT NULL
	)
),
needing AS (
	-- the rows still to fill. a user created since the column was added already has one from the signup hook
	SELECT id, row_number() OVER (ORDER BY created_at) AS position
	FROM users
	WHERE username IS NULL
)
UPDATE users SET
	username = free.username,
	-- the normalized form is written with the name, since uniqueness is decided on it and a row without one
	-- would be invisible to every taken-check: someone else could then be handed the very same name
	username_normalized = lower(replace(replace(free.username, '-', ''), '_', ''))
FROM needing
JOIN free ON free.position = needing.position
WHERE users.id = needing.id;
--> statement-breakpoint
-- a fallback for the case where there were more users to fill than free combinations. each row takes its own
-- number, so no two fallback names can match each other, and none carries the four-digit shape signup hands out
UPDATE users SET
	username = 'Fresh-Reader-' || fallback.n,
	username_normalized = 'freshreader' || fallback.n
FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM users WHERE username IS NULL) AS fallback
WHERE users.id = fallback.id;
