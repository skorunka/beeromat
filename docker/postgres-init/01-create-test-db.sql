-- Runs once on first container start (Postgres image executes every
-- .sql in /docker-entrypoint-initdb.d/ against the default DB).
--
-- Creates a SECOND database used exclusively by the E2E test suite,
-- fully isolated from the `beeromat` database used by `pnpm dev`.
-- The test suite truncates + reseeds `beeromat_test` freely without
-- ever touching dev data.
CREATE DATABASE beeromat_test OWNER beeromat;
