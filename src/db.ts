import Dexie, { type Table } from "dexie";
import type { Adjustment, BodyWeight, Feedback, Meso, Session, Settings } from "./types";

/** Local-first storage, one database per account. Every row change is reported to the sync layer. */
export class LedgerDB extends Dexie {
  settings!: Table<Settings & { key: string }, string>;
  mesos!: Table<Meso & { athleteId: string }, string>;
  sessions!: Table<Session, string>;
  feedback!: Table<Feedback, string>;
  adjustments!: Table<Adjustment, string>;
  bodyweight!: Table<BodyWeight, string>;
  kv!: Table<{ key: string; value: unknown }, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      settings: "key", mesos: "id, athleteId", sessions: "id, athleteId, meso, week, status",
      feedback: "id, athleteId, sessionId, muscle, state", adjustments: "id, athleteId, meso, week",
      bodyweight: "id, athleteId, date", kv: "key",
    });
    const watch = (kind: SyncKind, t: Table<any, string>, key: string) => {
      const idOf = (pk: unknown, obj: any) => String(pk ?? obj?.[key]);
      t.hook("creating", function (pk, obj) { changed(kind, idOf(pk, obj)); });
      t.hook("updating", function (_m, pk) { changed(kind, String(pk)); });
      t.hook("deleting", function (pk) { changed(kind, String(pk)); });
    };
    watch("settings", this.settings, "key"); watch("mesos", this.mesos, "id"); watch("sessions", this.sessions, "id");
    watch("feedback", this.feedback, "id"); watch("adjustments", this.adjustments, "id"); watch("bodyweight", this.bodyweight, "id"); watch("kv", this.kv, "key");
  }
}
export type SyncKind = "settings" | "mesos" | "sessions" | "feedback" | "adjustments" | "bodyweight" | "kv";
export const KINDS: SyncKind[] = ["settings", "mesos", "sessions", "feedback", "adjustments", "bodyweight", "kv"];

let listener: (kind: SyncKind, id: string) => void = () => {};
export const onRowChange = (fn: typeof listener) => { listener = fn; };
const changed = (kind: SyncKind, id: string) => listener(kind, id);

export let db: LedgerDB = new LedgerDB("ledger_none");
export function openDb(userId: string) {
  db.close();
  db = new LedgerDB(`ledger_${userId}`);
  return db;
}
