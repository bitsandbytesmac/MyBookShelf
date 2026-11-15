-- Journal entries of books that were deleted before deleting a book also removed its entries.
-- The foreign key only blanked their book link (ON DELETE SET NULL), so they lingered in
-- "Most Recent Entries" and still counted toward the reading streak.
DELETE FROM reading_activities WHERE book_id IS NULL;
