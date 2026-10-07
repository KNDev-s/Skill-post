CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  document TEXT NOT NULL CHECK(json_valid(document)),
  job TEXT CHECK(job IN ('generate','publish')),
  target_slide TEXT,
  due INTEGER,
  started INTEGER,
  finished INTEGER,
  publish_attempted INTEGER NOT NULL DEFAULT 0,
  container_id TEXT,
  published_id TEXT
);
CREATE INDEX posts_owner ON posts(owner);
CREATE INDEX posts_due ON posts(due) WHERE job IS NOT NULL AND started IS NULL;
CREATE INDEX posts_stale ON posts(started) WHERE finished IS NULL AND started IS NOT NULL;
CREATE TABLE commands (
  owner TEXT NOT NULL,
  key TEXT NOT NULL,
  hash TEXT NOT NULL,
  post_id TEXT NOT NULL,
  expected INTEGER NOT NULL,
  document TEXT NOT NULL,
  job TEXT,
  target_slide TEXT,
  due INTEGER,
  created INTEGER NOT NULL,
  PRIMARY KEY(owner, key)
);
CREATE INDEX commands_generation_date ON commands(created) WHERE job = 'generate';
-- A command, its resulting post and its durable job commit in one transaction.
CREATE TRIGGER command_create AFTER INSERT ON commands WHEN NEW.expected = 0 BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM commands WHERE job = 'generate' AND created >= NEW.created - 86400000) > 30
    THEN RAISE(ABORT, 'DAILY_QUOTA') END;
  SELECT CASE WHEN (SELECT count(*) FROM posts WHERE owner = NEW.owner AND job IS NOT NULL AND finished IS NULL) >= 5
    THEN RAISE(ABORT, 'ACTIVE_QUOTA') END;
  INSERT INTO posts(id, owner, document, job, target_slide, due)
    VALUES(NEW.post_id, NEW.owner, NEW.document, NEW.job, NEW.target_slide, NEW.due);
END;
CREATE TRIGGER command_update AFTER INSERT ON commands WHEN NEW.expected > 0 BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM commands WHERE job = 'generate' AND created >= NEW.created - 86400000) > 30
    THEN RAISE(ABORT, 'DAILY_QUOTA') END;
  UPDATE posts SET document=NEW.document, job=NEW.job, target_slide=NEW.target_slide,
    due=NEW.due, started=NULL, finished=NULL, container_id=NULL, published_id=NULL
    WHERE id=NEW.post_id AND owner=NEW.owner
    AND json_extract(document,'$.revision')=NEW.expected
    AND publish_attempted=0 AND (job IS NULL OR finished IS NOT NULL);
  SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'POST_CONFLICT') END;
END;
CREATE TABLE rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX rate_limits_expiry ON rate_limits(expires);
