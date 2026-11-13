-- The Cloudinary account was closed after covers moved to Vercel Blob, so these links are dead.
-- The app already falls back to the placeholder when an image fails to load; clearing the links just
-- stops the browser requesting dead URLs and marks those books as having no cover (ready for a new upload).

UPDATE books
   SET cover_url = NULL
 WHERE cover_url LIKE 'https://res.cloudinary.com/%';
