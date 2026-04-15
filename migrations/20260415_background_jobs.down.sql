DROP INDEX IF EXISTS idx_background_job_attempts_job;
DROP INDEX IF EXISTS idx_background_jobs_type;
DROP INDEX IF EXISTS idx_background_jobs_lock_expires;
DROP INDEX IF EXISTS idx_background_jobs_status_available;
DROP TABLE IF EXISTS background_job_attempts;
DROP TABLE IF EXISTS background_jobs;
