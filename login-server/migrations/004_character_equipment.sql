ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS equipment JSONB NOT NULL DEFAULT '{"weapon": null, "armour": null}';

