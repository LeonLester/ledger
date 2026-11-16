import { Library } from "./Library";
import { LeverTool } from "./Lever";

export function Exercises() {
  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Exercises</h1><p className="sub">Your library: muscles, units, effort type and machine geometry.</p></div></div>
      <Library />
    </div>
  );
}

export function Machines() {
  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Machines</h1><p className="sub">Effective resistance at the bottom and top of a rep, from the lever geometry. Save it to an exercise from its ruler icon in a session.</p></div></div>
      <section className="panel stack" style={{ padding: 16 }} aria-label="Mechanical advantage"><LeverTool /></section>
    </div>
  );
}
