-- users.id and books.id used to be set by the app to Date.now(), so two sign-ups (or two books)
-- in the same millisecond collided on the primary key. Let the database hand out ids instead.
--
-- Each sequence continues from the current highest id, so existing ids don't change and new ids
-- keep increasing ("recently added" ordering still works). It deliberately does NOT jump to the
-- current time: if the old code briefly keeps inserting Date.now() ids after this runs, those are far
-- above the sequence and can never collide with it.

CREATE SEQUENCE IF NOT EXISTS users_id_seq OWNED BY users.id;
SELECT CASE WHEN MAX(id) IS NULL THEN setval('users_id_seq', 1, false) ELSE setval('users_id_seq', MAX(id)) END FROM users;
ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq');

CREATE SEQUENCE IF NOT EXISTS books_id_seq OWNED BY books.id;
SELECT CASE WHEN MAX(id) IS NULL THEN setval('books_id_seq', 1, false) ELSE setval('books_id_seq', MAX(id)) END FROM books;
ALTER TABLE books ALTER COLUMN id SET DEFAULT nextval('books_id_seq');
