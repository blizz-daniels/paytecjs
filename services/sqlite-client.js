const { openDatabaseClient } = require("./database-client");

function openSqliteDatabase(dbPath) {
  return openDatabaseClient({
    sqlitePath: dbPath,
  });
}

module.exports = {
  openSqliteDatabase,
  openDatabaseClient,
};
