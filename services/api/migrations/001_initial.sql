-- Portable PostgreSQL schema; apply explicitly before serving requests, never in a handler.
CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE api_lock (id integer PRIMARY KEY CHECK (id = 1));
INSERT INTO api_lock(id) VALUES (1);
CREATE TABLE owners (
  id text PRIMARY KEY,
  device_hash text NOT NULL UNIQUE CHECK (length(device_hash)=64),
  recovery_hash text NOT NULL UNIQUE CHECK (length(recovery_hash)=64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE events (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  share_code text NOT NULL UNIQUE CHECK (share_code ~ '^[a-f0-9]{32}$'),
  data jsonb NOT NULL,
  published boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_owner_idx ON events(owner_id);
CREATE TABLE gifts (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE(event_id,id)
);
CREATE INDEX gifts_event_idx ON gifts(event_id,position);
CREATE TABLE reservations (
  event_id text NOT NULL,
  gift_id text PRIMARY KEY,
  guest_hash text NOT NULL CHECK (length(guest_hash)=64),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(event_id,gift_id) REFERENCES gifts(event_id,id) ON DELETE CASCADE
);
CREATE INDEX reservations_event_idx ON reservations(event_id);
CREATE TABLE operation_receipts (
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  status integer NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope,key)
);
CREATE INDEX operation_receipts_age_idx ON operation_receipts(created_at);
CREATE TABLE retired_credentials (
  hash text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rate_buckets (
  key text PRIMARY KEY,
  window_start bigint NOT NULL,
  hits integer NOT NULL
);
CREATE TABLE reports (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 1000),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX reports_state_idx ON reports(state,created_at);
-- Defense in depth: content cannot be archived while booked, and reservations
-- cannot be created on hidden gifts. Application locks event rows before both.
CREATE FUNCTION gift_archive_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.archived AND EXISTS (SELECT 1 FROM reservations WHERE gift_id = NEW.id) THEN
    RAISE EXCEPTION 'booked_gift' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.event_id <> OLD.event_id THEN
    RAISE EXCEPTION 'immutable_gift_event' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gift_archive_guard BEFORE INSERT OR UPDATE ON gifts FOR EACH ROW EXECUTE FUNCTION gift_archive_guard();
CREATE FUNCTION reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE hidden boolean; available boolean;
BEGIN
  SELECT g.archived, e.published INTO hidden, available FROM gifts g JOIN events e ON e.id = g.event_id WHERE g.id = NEW.gift_id AND g.event_id = NEW.event_id FOR UPDATE OF e;
  IF hidden IS NULL OR hidden OR NOT available THEN
    RAISE EXCEPTION 'gift_unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reservation_guard BEFORE INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION reservation_guard();
CREATE TABLE moderation_actions (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event_hash text NOT NULL, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES ('001_initial');
