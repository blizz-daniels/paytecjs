function createAdminImportService(options = {}) {
  const all = options.all;
  const run = options.run;
  const withSqlTransaction = options.withSqlTransaction;
  const hashPassword = options.hashPassword;
  const hashRounds = Number.isFinite(Number(options.hashRounds)) ? Number(options.hashRounds) : 10;
  const upsertProfileDisplayName = options.upsertProfileDisplayName;
  const normalizeIdentifier = options.normalizeIdentifier;
  const normalizeSurnamePassword = options.normalizeSurnamePassword;
  const isValidIdentifier = options.isValidIdentifier;
  const isValidSurnamePassword = options.isValidSurnamePassword;
  const normalizeDisplayName = options.normalizeDisplayName;
  const normalizeDepartment = options.normalizeDepartment;
  const isValidDepartment = options.isValidDepartment;

  function parseCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < String(line || "").length; i += 1) {
      const char = line[i];
      if (char === "\"") {
        if (inQuotes && line[i + 1] === "\"") {
          current += "\"";
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  function escapeCsvValue(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  }

  function buildImportReportCsv(results) {
    const header = ["line_number", "identifier", "status", "message"];
    const lines = [header.join(",")];
    results.forEach((result) => {
      lines.push(
        [
          escapeCsvValue(result.lineNumber),
          escapeCsvValue(result.identifier),
          escapeCsvValue(result.status),
          escapeCsvValue(result.message),
        ].join(",")
      );
    });
    return lines.join("\n");
  }

  async function processDepartmentChecklistCsv(csvText, optionsInput = {}) {
    const sourceName = String(optionsInput.sourceName || "admin-upload-checklists.csv");
    const actorUsername = normalizeIdentifier(optionsInput.actorUsername || "admin");
    const applyChanges = !!optionsInput.applyChanges;
    const raw = String(csvText || "");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => String(line || "").trim())
      .filter((line) => line.length > 0);

    if (!lines.length) {
      throw new Error("CSV is empty.");
    }

    const headers = parseCsvLine(lines[0]).map((header) => String(header || "").trim().toLowerCase());
    const departmentIndex = headers.indexOf("department");
    const itemIndex = ["task", "item", "checklist_item", "checklist", "description"].reduce((foundIndex, candidate) => {
      if (foundIndex !== -1) {
        return foundIndex;
      }
      return headers.indexOf(candidate);
    }, -1);
    const orderIndex = ["order", "position", "item_order"].reduce((foundIndex, candidate) => {
      if (foundIndex !== -1) {
        return foundIndex;
      }
      return headers.indexOf(candidate);
    }, -1);

    if (departmentIndex === -1 || itemIndex === -1) {
      throw new Error("Invalid checklist header. Expected columns: department,task");
    }

    const results = [];
    const validRows = [];
    const seenInFile = new Set();
    const summary = {
      totalRows: Math.max(0, lines.length - 1),
      validRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      inserts: 0,
      updates: 0,
      imported: 0,
    };

    for (let i = 1; i < lines.length; i += 1) {
      const lineNumber = i + 1;
      const row = parseCsvLine(lines[i]);
      const department = normalizeDepartment(row[departmentIndex] || "");
      const itemText = String(row[itemIndex] || "").trim().replace(/\s+/g, " ");
      const orderRaw = orderIndex === -1 ? "" : String(row[orderIndex] || "").trim();
      const parsedOrder = Number.parseInt(orderRaw, 10);
      const itemOrder =
        Number.isFinite(parsedOrder) && parsedOrder > 0 ? parsedOrder : validRows.filter((entry) => entry.department === department).length + 1;
      const dedupeKey = `${department}::${itemText.toLowerCase()}`;

      if (!isValidDepartment(department)) {
        summary.invalidRows += 1;
        results.push({ lineNumber, identifier: department, status: "error", message: "Invalid department value." });
        continue;
      }
      if (!itemText || itemText.length > 220) {
        summary.invalidRows += 1;
        results.push({
          lineNumber,
          identifier: department,
          status: "error",
          message: "Checklist task is required and must be 220 characters or less.",
        });
        continue;
      }
      if (seenInFile.has(dedupeKey)) {
        summary.invalidRows += 1;
        summary.duplicateRows += 1;
        results.push({
          lineNumber,
          identifier: department,
          status: "duplicate_in_file",
          message: "Duplicate department/task row in this upload.",
        });
        continue;
      }
      seenInFile.add(dedupeKey);

      validRows.push({ lineNumber, department, itemText, itemOrder });
      summary.validRows += 1;
      summary.inserts += 1;
      summary.imported += 1;
      results.push({
        lineNumber,
        identifier: department,
        status: "insert",
        message: "Will import checklist task.",
      });
    }

    if (applyChanges && validRows.length) {
      await withSqlTransaction(async () => {
        const touchedDepartments = Array.from(new Set(validRows.map((row) => row.department)));
        for (const department of touchedDepartments) {
          await run(
            `
              DELETE FROM student_checklist_progress
              WHERE checklist_id IN (
                SELECT id FROM department_checklists WHERE department = ?
              )
            `,
            [department]
          );
          await run("DELETE FROM department_checklists WHERE department = ?", [department]);
        }

        for (const row of validRows) {
          await run(
            `
              INSERT INTO department_checklists (department, item_text, item_order, source_file, created_by)
              VALUES (?, ?, ?, ?, ?)
            `,
            [row.department, row.itemText, row.itemOrder, sourceName, actorUsername || "admin"]
          );
        }
      });

      validRows.forEach((row) => {
        const existing = results.find((entry) => Number(entry.lineNumber) === Number(row.lineNumber));
        if (existing) {
          existing.message = "Checklist task imported.";
        }
      });
    }

    return {
      summary,
      rows: results,
      reportCsv: buildImportReportCsv(results),
    };
  }

  async function processRosterCsv(csvText, optionsInput = {}) {
    const role = String(optionsInput.role || "").trim();
    const idHeader = String(optionsInput.idHeader || "").trim();
    const sourceName = String(optionsInput.sourceName || "").trim();
    const applyChanges = !!optionsInput.applyChanges;
    const raw = String(csvText || "");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 1) {
      throw new Error("CSV is empty.");
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const idCandidates = [idHeader];
    if (idHeader === "teacher_code") {
      idCandidates.push("lecturer_code");
    }
    const idIndex = idCandidates.reduce((foundIndex, candidate) => {
      if (foundIndex !== -1) {
        return foundIndex;
      }
      return headers.indexOf(candidate);
    }, -1);
    const surnameIndex = headers.indexOf("surname");
    const departmentIndex = ["department", "dept"].reduce((foundIndex, candidate) => {
      if (foundIndex !== -1) {
        return foundIndex;
      }
      return headers.indexOf(candidate);
    }, -1);
    const nameIndex = ["name", "full_name", "display_name", "student_name"].reduce((foundIndex, candidate) => {
      if (foundIndex !== -1) {
        return foundIndex;
      }
      return headers.indexOf(candidate);
    }, -1);

    if (idIndex === -1 || surnameIndex === -1 || departmentIndex === -1) {
      throw new Error(`Invalid roster header. Expected columns: ${idHeader},surname,department`);
    }

    const existingRows = await all("SELECT auth_id FROM auth_roster WHERE role = ?", [role]);
    const existingIds = new Set(existingRows.map((row) => normalizeIdentifier(row.auth_id)));
    const seenInFile = new Set();
    const results = [];
    const pendingWrites = [];
    const summary = {
      totalRows: Math.max(0, lines.length - 1),
      validRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      inserts: 0,
      updates: 0,
      imported: 0,
    };

    for (let i = 1; i < lines.length; i += 1) {
      const lineNumber = i + 1;
      const row = parseCsvLine(lines[i]);
      const identifier = normalizeIdentifier(row[idIndex]);
      const surnamePassword = normalizeSurnamePassword(row[surnameIndex]);
      const rawDisplayName = nameIndex !== -1 ? normalizeDisplayName(row[nameIndex]) : "";
      const department = normalizeDepartment(row[departmentIndex] || "");

      if (!isValidIdentifier(identifier)) {
        summary.invalidRows += 1;
        results.push({
          lineNumber,
          identifier,
          status: "error",
          message: `Invalid ${idHeader}. Use 3-40 chars: letters, numbers, /, _, -.`,
        });
        continue;
      }
      if (seenInFile.has(identifier)) {
        summary.invalidRows += 1;
        summary.duplicateRows += 1;
        results.push({
          lineNumber,
          identifier,
          status: "duplicate_in_file",
          message: `Duplicate ${idHeader} in this upload.`,
        });
        continue;
      }
      seenInFile.add(identifier);

      if (!isValidSurnamePassword(surnamePassword)) {
        summary.invalidRows += 1;
        results.push({
          lineNumber,
          identifier,
          status: "error",
          message: "Invalid surname password format.",
        });
        continue;
      }
      if (!isValidDepartment(department)) {
        summary.invalidRows += 1;
        results.push({
          lineNumber,
          identifier,
          status: "error",
          message: "Invalid department value.",
        });
        continue;
      }

      const exists = existingIds.has(identifier);
      const result = {
        lineNumber,
        identifier,
        status: exists ? "update" : "insert",
        message: exists ? "Will update existing account." : "Will create new account.",
      };

      if (applyChanges) {
        const passwordHash = await hashPassword(surnamePassword, hashRounds);
        pendingWrites.push({ identifier, passwordHash, rawDisplayName, department });
        result.message = exists ? "Updated existing account." : "Created new account.";
      }

      if (exists) {
        summary.updates += 1;
      } else {
        summary.inserts += 1;
        existingIds.add(identifier);
      }
      summary.validRows += 1;
      summary.imported += 1;
      results.push(result);
    }

    if (applyChanges && pendingWrites.length) {
      await withSqlTransaction(async () => {
        for (const entry of pendingWrites) {
          await run(
            `
              INSERT INTO auth_roster (auth_id, role, password_hash, source_file, department)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(auth_id, role) DO UPDATE SET
                password_hash = excluded.password_hash,
                source_file = excluded.source_file,
                department = excluded.department
            `,
            [entry.identifier, role, entry.passwordHash, sourceName, entry.department]
          );
          if (entry.rawDisplayName) {
            await upsertProfileDisplayName(entry.identifier, entry.rawDisplayName);
          }
        }
      });
    }

    return {
      role,
      summary,
      rows: results,
      reportCsv: buildImportReportCsv(results),
    };
  }

  async function importRosterCsvText(csvText, role, idHeader, sourceName) {
    if (!String(csvText || "").trim()) {
      return 0;
    }
    const result = await processRosterCsv(csvText, {
      role,
      idHeader,
      sourceName,
      applyChanges: true,
    });
    return result.summary.imported;
  }

  return {
    buildImportReportCsv,
    processDepartmentChecklistCsv,
    processRosterCsv,
    importRosterCsvText,
  };
}

module.exports = {
  createAdminImportService,
};
