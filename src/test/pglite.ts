import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

/** An in-memory Postgres with the extensions the migrations need (pg_trgm, from 0004). */
export function createPGlite(): PGlite {
  return new PGlite({ extensions: { pg_trgm } });
}
