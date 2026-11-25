import { useMemo } from "react";
import { create } from "zustand";
import { useStore } from "../store";
import type { Adjustment, BodyWeight, ExerciseDef, Feedback, Meso, Seed, Session, Settings } from "../types";

export interface ClientView { id: string; name: string; email: string; data: Record<string, any[]>; comments: { id: string; sessionId: string | null; body: string; created: number; fromClient?: number }[]; assignments: { id: string; name: string; note: string | null; state: string; created: number }[] }
/** When set, the Progress screens render this client's data read-only instead of your own. */
export const useViewing = create<{ client: ClientView | null; set(c: ClientView | null): void }>((set) => ({ client: null, set: (client) => set({ client }) }));

export interface Data { sessions: Session[]; bodyweight: BodyWeight[]; settings: Settings; library: Record<string, ExerciseDef>; split: Seed["split"]; mesos: Meso[]; feedback: Feedback[]; adjustments: Adjustment[]; readOnly: boolean }

const strip = <T,>(rows: any[] | undefined): T[] => (rows ?? []).map(({ __id, ...r }) => r as T);

/** The data a screen should show: the signed-in athlete's own, or a client's when a coach is viewing. */
export function useData() {
  const own = useStore();
  const { client } = useViewing();
  return useMemo(() => {
    if (!client) return { ...own, readOnly: false } as typeof own & { readOnly: boolean };
    const d = client.data;
    const kv = (k: string) => (d.kv ?? []).find((r) => r.__id === k)?.value;
    const settings = ((d.settings ?? [])[0] ?? own.settings) as Settings;
    return {
      ...own, readOnly: true, settings, sessions: strip<Session>(d.sessions), mesos: strip<Meso>(d.mesos), feedback: strip<Feedback>(d.feedback), adjustments: strip<Adjustment>(d.adjustments),
      bodyweight: strip<BodyWeight>(d.bodyweight), library: (kv("library") ?? {}) as Record<string, ExerciseDef>, split: (kv("split") ?? []) as Seed["split"],
      setSettings: () => {}, addBodyweight: () => {}, muscleOf: (ex: string) => ((kv("library") ?? {}) as Record<string, ExerciseDef>)[ex]?.muscle ?? own.muscleOf(ex),
    } as typeof own & { readOnly: boolean };
  }, [own, client]);
}
