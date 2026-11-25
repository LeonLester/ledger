interface D1Result<T> { results: T[] }
interface D1PreparedStatement { bind(...v: unknown[]): D1PreparedStatement; run(): Promise<unknown>; first<T = unknown>(): Promise<T | null>; all<T = unknown>(): Promise<D1Result<T>> }
interface D1Database { prepare(q: string): D1PreparedStatement; batch(s: D1PreparedStatement[]): Promise<unknown[]> }
interface Mailer { send(m: { to: string; from: string; subject: string; text: string }): Promise<unknown> }
interface DurableObjectStub { fetch(req: Request): Promise<Response> }
interface DurableObjectNamespace { idFromName(n: string): unknown; get(id: unknown): DurableObjectStub }
interface DurableObjectState { acceptWebSocket(ws: unknown): void; getWebSockets(): { send(m: string): void; close(code?: number, reason?: string): void }[] }
declare class WebSocketPair { 0: unknown; 1: unknown }
interface Env { HUB?: DurableObjectNamespace; DB: D1Database; EMAIL?: Mailer; MAIL_FROM?: string; COACH_KEY?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; PUBLIC_ORIGIN?: string; ADMIN_EMAILS?: string }
