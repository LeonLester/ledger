import type { P3 } from "./joints";

export interface PoseFrame { lm: P3[]; world: P3[] }
export interface PoseModel { detect(video: HTMLVideoElement, tMs: number): PoseFrame | null; close(): void }

/** Bones to draw, as landmark index pairs: shoulders, arms, torso, legs. */
export const BONES: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 31], [24, 26], [26, 28], [28, 32]];

/**
 * Loads MediaPipe's pose landmarker from files shipped with the app (public/mediapipe and public/models), so it runs on the device and offline.
 * The GPU path is tried first and the CPU path is the fallback. Loaded on first use so the rest of the app does not pay for it.
 */
export async function loadPose(): Promise<PoseModel> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe");
  const make = (delegate: "GPU" | "CPU") => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate },
    runningMode: "VIDEO", numPoses: 1,
  });
  let lm;
  try { lm = await make("GPU"); } catch { lm = await make("CPU"); }
  let last = -1;
  return {
    detect(video, tMs) {
      if (tMs <= last) tMs = last + 1; // timestamps must increase
      last = tMs;
      const r = lm.detectForVideo(video, tMs);
      if (!r.landmarks[0]) return null;
      const map = (a: { x: number; y: number; z: number; visibility?: number }[]) => a.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility }));
      return { lm: map(r.landmarks[0]), world: map(r.worldLandmarks[0]) };
    },
    close() { lm.close(); },
  };
}
