interface D1Result<T> { results: T[] }
interface D1PreparedStatement { bind(...v: unknown[]): D1PreparedStatement; run(): Promise<unknown>; first<T = unknown>(): Promise<T | null>; all<T = unknown>(): Promise<D1Result<T>> }
interface D1Database { prepare(q: string): D1PreparedStatement; batch(s: D1PreparedStatement[]): Promise<unknown[]> }
interface Env { DB: D1Database; COACH_KEY?: string }
