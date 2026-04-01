const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDatabaseClient } = require("../services/database-client");

describe("database client", () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "paytec-db-client-"));
    db = openDatabaseClient({
      sqlitePath: path.join(tmpDir, "test.sqlite"),
    });
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("supports sqlite-style schema helpers and insert ids", async () => {
    await db.run("PRAGMA foreign_keys = ON");
    await db.run(`
      CREATE TABLE payment_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL
      )
    `);
    const insert = await db.run("INSERT INTO payment_items (title) VALUES (?)", ["Tuition"]);
    expect(Number(insert.lastID || 0)).toBeGreaterThan(0);

    const row = await db.get("SELECT * FROM payment_items WHERE id = ? LIMIT 1", [insert.lastID]);
    expect(row).toMatchObject({
      id: Number(insert.lastID || 0),
      title: "Tuition",
    });

    const columns = await db.all("PRAGMA table_info(payment_items)");
    expect(columns.some((column) => column.name === "title")).toBe(true);

    const existsRow = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'payment_items'");
    expect(existsRow).toMatchObject({ name: "payment_items" });
  });
});
