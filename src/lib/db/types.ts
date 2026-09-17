export type Row = Record<string, unknown>;

/** Anything that can run a parameterised SQL statement. */
export interface Queryable {
  query<T = Row>(text: string, params?: readonly unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  readonly kind: "pglite" | "postgres";
  /** Runs `fn` inside one transaction; rolls back if it throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
