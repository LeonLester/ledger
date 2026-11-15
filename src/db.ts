import Dexie, { type Table } from "dexie";
import type { Adjustment, BodyWeight, Feedback, Meso, Session, Settings } from "./types";

/** Local-first storage. Every row carries athleteId so the same schema maps onto D1 for sync and multi-user later. */
class LedgerDB extends Dexie {
  settings!: Table<Settings & { key: string }, string>;
  mesos!: Table<Meso & { athleteId: string }, string>;
  sessions!: Table<Session, string>;
  feedback!: Table<Feedback, string>;
  adjustments!: Table<Adjustment, string>;
  bodyweight!: Table<BodyWeight, string>;
  kv!: Table<{ key: string; value: unknown }, string>;
  constructor() {
    super("ledger");
    this.version(1).stores({
      settings: "key", mesos: "id, athleteId", sessions: "id, athleteId, meso, week, status",
      feedback: "id, athleteId, sessionId, muscle, state", adjustments: "id, athleteId, meso, week",
      bodyweight: "id, athleteId, date", kv: "key",
    });
  }
}
export const db = new LedgerDB();
