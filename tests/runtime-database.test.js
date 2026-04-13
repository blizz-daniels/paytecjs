const { resolveDatabaseRuntime, isSupabaseDatabaseUrl } = require("../services/runtime-database");

describe("runtime database policy", () => {
  test("accepts Supabase Postgres urls for production", () => {
    const runtime = resolveDatabaseRuntime({
      nodeEnv: "production",
      databaseUrl: "postgresql://postgres:pass@db.abcdefghijklmnop.supabase.co:5432/postgres",
      sqlitePath: "/tmp/local.sqlite",
    });
    expect(runtime.driver).toBe("postgres");
    expect(runtime.isProduction).toBe(true);
    expect(runtime.isSupabase).toBe(true);
    expect(runtime.sqlitePath).toBeNull();
  });

  test("rejects non-supabase urls in production by default", () => {
    expect(() =>
      resolveDatabaseRuntime({
        nodeEnv: "production",
        databaseUrl: "postgresql://postgres:pass@localhost:5432/paytec",
        sqlitePath: "/tmp/local.sqlite",
      })
    ).toThrow(/Supabase/i);
  });

  test("uses sqlite for local development when DATABASE_URL is absent", () => {
    const runtime = resolveDatabaseRuntime({
      nodeEnv: "development",
      databaseUrl: "",
      sqlitePath: "/tmp/paytec.sqlite",
    });
    expect(runtime.driver).toBe("sqlite");
    expect(runtime.sqlitePath).toContain("paytec.sqlite");
  });

  test("supabase host detection handles pooler hosts", () => {
    expect(
      isSupabaseDatabaseUrl("postgresql://postgres:pass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres")
    ).toBe(true);
  });
});
