/** Letters follow the workbook: the same letter means one superset, the number is the order inside it (A1, A2, B1). */
export const prefix = (l: string) => l.replace(/\d+$/, "");

interface L { letter: string }

/** Renumbers a list: consecutive items sharing a letter stay one group, every other item starts its own. */
export function relabel<T extends L>(items: T[]): T[] {
  let g = -1, n = 0, prev: string | null = null;
  return items.map((it, i) => {
    const key = prefix(it.letter) || `\0${i}`;
    if (key !== prev) { g++; n = 0; prev = key; }
    n++;
    return { ...it, letter: `${String.fromCharCode(65 + g)}${n}` };
  });
}

/** Link item j with the one before it (superset), or split it and the rest of its group off. */
export function linkPrev<T extends L>(items: T[], j: number, link: boolean): T[] {
  const a = items.map((x) => ({ ...x }));
  if (link) {
    if (j < 1) return relabel(a);
    let p = prefix(a[j - 1].letter);
    if (!p) { p = "~g"; a[j - 1].letter = p; }
    a[j].letter = p;
  } else {
    const p = prefix(a[j].letter);
    for (let k = j; k < a.length && prefix(a[k].letter) === p; k++) a[k].letter = "~";
  }
  return relabel(a);
}

/** For each index: its position in a superset run. size is 1 for a normal exercise. */
export function runs(items: L[]): { first: boolean; last: boolean; size: number; pos: number }[] {
  const out = items.map(() => ({ first: true, last: true, size: 1, pos: 0 }));
  let i = 0;
  while (i < items.length) {
    const p = prefix(items[i].letter);
    let j = i + 1;
    if (p) while (j < items.length && prefix(items[j].letter) === p) j++;
    for (let k = i; k < j; k++) out[k] = { first: k === i, last: k === j - 1, size: j - i, pos: k - i };
    i = j;
  }
  return out;
}

/** Colours follow the training workbook: push blue, pull green, quads red, posterior chain yellow, the rest pink. */
export function muscleColor(m: string): string {
  if (/^(Chest|Triceps|Shoulders \(Front\))/.test(m)) return "#6d9eeb";
  if (/^(Mid Back|Back|Lumbar|Biceps)/.test(m)) return "#93c47d";
  if (m === "Quads") return "#e06666";
  if (/^(Hamstrings|Glutes|Erectors)/.test(m)) return "#ffd966";
  return "#d5a6bd";
}
