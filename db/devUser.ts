// the dev stand-in user id until Better Auth lands. the seed creates this user, and api/currentUser resolves to it
// it lives in the db so both the seed data and the api can import it without crossing a module boundary
export const DEV_USER_ID = "usr_dev_evan"
