-- The frozen prompt, enforced by the database.
--
-- MasteringRun.prompt/promptVersion are compiled once at queue time and must
-- never change under a run: what a given image was actually asked for is the
-- whole audit record, and the schema has said so in a comment since day one.
-- A comment did not hold. On 2026-08-25 an ad-hoc write rewrote three
-- dispatched runs from v1 to v2 while their Slack tasks still quoted v1, so
-- the database now claims a photo was rendered from a prompt that did not
-- exist on the day it was rendered. That record cannot be trusted backwards
-- and nothing in the pipeline noticed.
--
-- Retries are new rows (attempt+1) with a freshly compiled prompt — every
-- legitimate path CREATEs. Nothing in the scripts updates these two columns,
-- so this trigger costs the pipeline nothing and closes the hole to anything
-- reaching the table from outside it.
--
-- A deliberate correction drops the trigger, edits, and re-creates it — which
-- is exactly the visible, on-purpose act that an ad-hoc UPDATE was not.

CREATE OR REPLACE FUNCTION mastering_run_prompt_is_frozen()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.prompt IS DISTINCT FROM OLD.prompt
     OR NEW."promptVersion" IS DISTINCT FROM OLD."promptVersion" THEN
    RAISE EXCEPTION
      'MasteringRun %: prompt/promptVersion are frozen at queue time (% -> %). A retry is a NEW row with attempt+1.',
      OLD.id, OLD."promptVersion", NEW."promptVersion";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mastering_run_prompt_frozen ON "MasteringRun";
CREATE TRIGGER mastering_run_prompt_frozen
  BEFORE UPDATE ON "MasteringRun"
  FOR EACH ROW
  EXECUTE FUNCTION mastering_run_prompt_is_frozen();
