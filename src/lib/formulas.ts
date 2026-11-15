/** The estimating formulas the app uses. They are module settings so every screen and the PR engine agree. */
export type E1rmKey = "epley" | "brzycki" | "lombardi" | "oconner" | "mayhew" | "wathan" | "lander" | "custom";
export type ScoreKey = "dots" | "wilks" | "ipf";
export interface Formulas { e1rm: E1rmKey; custom?: string; useRir?: boolean; score?: ScoreKey; warm?: [number, number][] }

export const E1RM_LABEL: Record<E1rmKey, string> = {
  epley: "Epley", brzycki: "Brzycki", lombardi: "Lombardi", oconner: "O'Connor", mayhew: "Mayhew", wathan: "Wathan", lander: "Lander", custom: "Custom",
};
export const E1RM_TEXT: Record<Exclude<E1rmKey, "custom">, string> = {
  epley: "w * (1 + r / 30)", brzycki: "w * 36 / (37 - r)", lombardi: "w * r ^ 0.10", oconner: "w * (1 + 0.025 * r)",
  mayhew: "100 * w / (52.2 + 41.9 * exp(-0.055 * r))", wathan: "100 * w / (48.8 + 53.8 * exp(-0.075 * r))", lander: "100 * w / (101.3 - 2.67123 * r)",
};
export const SCORE_LABEL: Record<ScoreKey, string> = { dots: "DOTS", wilks: "Wilks 2020", ipf: "IPF GL" };
export const DEFAULT_WARM: [number, number][] = [[0.4, 8], [0.6, 5], [0.8, 3]];

// ---- a small, safe expression evaluator: numbers, w, r, + - * / ^, parentheses, a few functions ----
type Tok = { t: "n"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };
function lex(src: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
    if (num) { out.push({ t: "n", v: Number(num[1]) }); i += num[1].length; continue; }
    const id = /^[a-zA-Z_]\w*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0].toLowerCase() }); i += id[0].length; continue; }
    if ("+-*/^(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
}
const FN: Record<string, (...a: number[]) => number> = { exp: Math.exp, ln: Math.log, log: Math.log10, sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow };

/** Compiles an expression in w (load) and r (reps) to a function. Throws a readable error for bad input. */
export function compile(src: string): (w: number, r: number) => number {
  const toks = lex(src); let p = 0;
  type Node = (v: { w: number; r: number }) => number;
  const peek = () => toks[p], eat = () => toks[p++];
  const expect = (s: string) => { const t = eat(); if (!t || t.t !== "op" || t.v !== s) throw new Error(`Expected "${s}"`); };
  const primary = (): Node => {
    const t = eat();
    if (!t) throw new Error("The formula ends too early");
    if (t.t === "n") { const v = t.v; return () => v; }
    if (t.t === "id") {
      if (t.v === "w" || t.v === "r") { const k = t.v; return (v) => v[k]; }
      if (t.v === "pi") return () => Math.PI;
      const f = FN[t.v];
      if (!f) throw new Error(`Unknown name "${t.v}". Use w, r, exp, ln, sqrt, min, max, pow.`);
      expect("("); const args: Node[] = [];
      if (!(peek()?.t === "op" && peek()!.v === ")")) { do { args.push(add()); } while (peek()?.t === "op" && peek()!.v === "," && eat()); }
      expect(")");
      return (v) => f(...args.map((a) => a(v)));
    }
    if (t.v === "(") { const e = add(); expect(")"); return e; }
    if (t.v === "-") { const e = unary(); return (v) => -e(v); }
    if (t.v === "+") return unary();
    throw new Error(`Unexpected "${t.v}"`);
  };
  const unary = (): Node => primary();
  const pow = (): Node => { const b = primary(); if (peek()?.t === "op" && peek()!.v === "^") { eat(); const e = unaryPow(); return (v) => Math.pow(b(v), e(v)); } return b; };
  const unaryPow = (): Node => { if (peek()?.t === "op" && peek()!.v === "-") { eat(); const e = unaryPow(); return (v) => -e(v); } return pow(); };
  const mul = (): Node => { let l = pow(); while (peek()?.t === "op" && (peek()!.v === "*" || peek()!.v === "/")) { const o = (eat() as { v: string }).v, r = pow(), a = l; l = o === "*" ? (v) => a(v) * r(v) : (v) => a(v) / r(v); } return l; };
  const add = (): Node => { let l = mul(); while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) { const o = (eat() as { v: string }).v, r = mul(), a = l; l = o === "+" ? (v) => a(v) + r(v) : (v) => a(v) - r(v); } return l; };
  const root = add();
  if (p < toks.length) throw new Error(`Unexpected "${(toks[p] as { v: unknown }).v}"`);
  return (w, r) => root({ w, r });
}

/** null when the formula works, otherwise what is wrong with it */
export function checkFormula(src: string): string | null {
  try {
    const f = compile(src);
    for (const r of [1, 5, 10]) { const v = f(100, r); if (!Number.isFinite(v) || v <= 0) return `It gives ${Number.isFinite(v) ? v.toFixed(1) : "no number"} for 100 x ${r}. It should be a positive weight.`; }
    if (f(100, 5) < 100) return "At 100 x 5 it gives less than 100, so it would undercount.";
    return null;
  } catch (e) { return (e as Error).message; }
}

const BUILT: Record<Exclude<E1rmKey, "custom">, (w: number, r: number) => number> = {} as never;
for (const k of Object.keys(E1RM_TEXT) as Exclude<E1rmKey, "custom">[]) BUILT[k] = compile(E1RM_TEXT[k]);

let fx: Formulas = { e1rm: "epley" };
let custom: ((w: number, r: number) => number) | null = null;
export function setFormulas(next: Formulas | undefined) {
  fx = next ?? { e1rm: "epley" };
  custom = null;
  if (fx.e1rm === "custom" && fx.custom && !checkFormula(fx.custom)) custom = compile(fx.custom);
}
export const formulas = () => fx;

/** reps used for estimating: reps done, plus reps in reserve when that option is on */
export const effReps = (s: { reps: number | null; rir?: number | null }) => (s.reps ?? 0) + (fx.useRir && s.rir != null ? Math.max(0, s.rir) : 0);

/** estimated one rep max for w x r. A single is the weight itself. */
export function est1rm(w: number, r: number): number {
  if (r <= 1) return w;
  const f = fx.e1rm === "custom" ? custom ?? BUILT.epley : BUILT[fx.e1rm as Exclude<E1rmKey, "custom">];
  const v = f(w, Math.min(r, 36));
  return Number.isFinite(v) && v > 0 ? v : BUILT.epley(w, r);
}
/** weight you can lift for n reps at a given 1RM, from the same formula (they are linear in the load) */
export const weightForReps = (e1: number, n: number) => (n <= 1 ? e1 : e1 / (est1rm(1, n) || 1));

// ---- strength scores ----
const POLY = (c: number[], x: number) => c.reduce((a, k, i) => a + k * x ** i, 0);
const DOTS = { m: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093], f: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706] };
const WILKS = {
  m: [47.46178854, 8.472061379, 0.07369410346, -0.001395833811, 7.07665973070743e-6, -1.20804336482315e-8],
  f: [-125.4255398, 13.71219419, -0.03307250631, -0.001050400051, 9.38773881462799e-6, -2.3334613884954e-8],
};
const IPF = { m: [1199.72839, 1025.18162, 0.00921], f: [610.32796, 1045.59282, 0.03048] };
export function score(total: number, bw: number, sex: "m" | "f", kind: ScoreKey = fx.score ?? "dots"): number {
  if (kind === "wilks") { const x = Math.min(Math.max(bw, sex === "m" ? 40 : 40), sex === "m" ? 200.95 : 150.95); return (600 / POLY(WILKS[sex], x)) * total; }
  if (kind === "ipf") { const [a, b, c] = IPF[sex]; return (total * 100) / (a - b * Math.exp(-c * bw)); }
  const x = Math.min(bw, sex === "m" ? 210 : 150);
  return (500 / POLY(DOTS[sex], x)) * total;
}

// ---- warm-ups ----
export const warmText = (w: [number, number][] = DEFAULT_WARM) => w.map(([p, r]) => `${Math.round(p * 100)}%x${r}`).join(", ");
export function parseWarm(text: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of text.split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean)) {
    const m = /^(\d{1,3})\s*%?\s*[x×*]\s*(\d{1,2})$/i.exec(part);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 100) return null;
    out.push([Number(m[1]) / 100, Number(m[2])]);
  }
  return out;
}
