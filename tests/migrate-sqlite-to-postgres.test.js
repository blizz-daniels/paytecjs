const { buildInsertSql, sortTablesForImport } = require("../scripts/migrate-sqlite-to-postgres");

describe("sqlite to postgres migration helper", () => {
  test("orders core tables before dependent tables", () => {
    expect(
      sortTablesForImport([
        "payment_receipt_events",
        "payment_receipts",
        "users",
        "messages",
        "payment_items",
      ])
    ).toEqual(["users", "payment_items", "messages", "payment_receipts", "payment_receipt_events"]);
  });

  test("builds a parameterized multi-row insert", () => {
    expect(buildInsertSql("users", ["username", "role"], 2)).toBe(
      'INSERT INTO "users" ("username", "role") VALUES (?, ?), (?, ?)'
    );
  });
});
