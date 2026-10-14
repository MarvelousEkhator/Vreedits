// lib/feedback.js
import { pool } from "./analytics";

let ready = null;

// Creates the feedback table the first time it is needed. Nothing to migrate.
export function ensureFeedbackTable() {
  if (!ready) {
    ready = pool
      .query(
        `CREATE TABLE IF NOT EXISTS feedback (
           id BIGSERIAL PRIMARY KEY,
           user_id TEXT NOT NULL,
           username TEXT,
           display_name TEXT,
           rating SMALLINT NOT NULL,
           message TEXT,
           source TEXT,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      )
      .then(() =>
        pool.query(
          `CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC)`
        )
      )
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  return ready;
}