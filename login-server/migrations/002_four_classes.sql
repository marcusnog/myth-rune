DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'characters'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%character_class%'
  ) LOOP
    EXECUTE format('ALTER TABLE characters DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE characters
  ADD CONSTRAINT characters_character_class_check
  CHECK (character_class IN ('warrior', 'mage', 'rogue', 'archer'));
