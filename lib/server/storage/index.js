function createContentAccessService(options = {}) {
  const all = options.all;
  const get = options.get;
  const normalizeIdentifier = options.normalizeIdentifier;
  const normalizeDepartment = options.normalizeDepartment;
  const isValidDepartment = options.isValidDepartment;
  const departmentScopeMatchesStudent = options.departmentScopeMatchesStudent;

  async function ensureCanManageContent(input = {}) {
    const table = String(input.table || "").trim();
    const id = Number(input.id || 0);
    const actorUsername = String(input.actorUsername || "").trim();
    const isAdmin = !!input.isAdmin;
    const row = await get(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    if (!row) {
      return { error: "not_found" };
    }
    if (isAdmin || row.created_by === actorUsername) {
      return { row };
    }
    return { error: "forbidden" };
  }

  function assertStudentContentAccess(input = {}) {
    const row = input.row || {};
    const actorUsername = String(input.actorUsername || "").trim();
    const studentDepartment = String(input.studentDepartment || "").trim();
    const noun = String(input.noun || "content").trim() || "content";
    const directUserField = String(input.directUserField || "user_id").trim() || "user_id";
    const targetDepartmentField = String(input.targetDepartmentField || "target_department").trim() || "target_department";
    const directUserMatch =
      !row[directUserField] || normalizeIdentifier(row[directUserField] || "") === normalizeIdentifier(actorUsername || "");
    if (!directUserMatch || !departmentScopeMatchesStudent(row[targetDepartmentField], studentDepartment)) {
      throw { status: 403, error: `You do not have access to this ${noun}.` };
    }
  }

  async function getRosterUserDepartment(username, role) {
    const normalizedUsername = normalizeIdentifier(username || "");
    const normalizedRole = String(role || "")
      .trim()
      .toLowerCase();
    if (!normalizedUsername) {
      return "";
    }
    const rolesToTry = [];
    if (normalizedRole === "student" || normalizedRole === "teacher") {
      rolesToTry.push(normalizedRole);
    }
    if (!rolesToTry.length) {
      rolesToTry.push("student", "teacher");
    }
    for (const candidateRole of rolesToTry) {
      const row = await get(
        `
          SELECT department
          FROM auth_roster
          WHERE auth_id = ?
            AND role = ?
          LIMIT 1
        `,
        [normalizedUsername, candidateRole]
      );
      if (row && row.department) {
        return normalizeDepartment ? normalizeDepartment(row.department) : String(row.department || "").trim();
      }
    }
    return "";
  }

  async function getSessionUserDepartment(input = {}) {
    const actorUsername = normalizeIdentifier(input.actorUsername || "");
    const actorRole = String(input.actorRole || "")
      .trim()
      .toLowerCase();
    if (!actorUsername || actorRole === "admin") {
      return "";
    }
    return getRosterUserDepartment(actorUsername, actorRole);
  }

  async function resolveContentTargetDepartment(input = {}) {
    const actorRole = String(input.actorRole || "")
      .trim()
      .toLowerCase();
    const actorDepartment = normalizeDepartment ? normalizeDepartment(input.actorDepartment || "") : String(input.actorDepartment || "").trim();
    const normalizedProvided = normalizeDepartment
      ? normalizeDepartment(input.providedDepartment || "")
      : String(input.providedDepartment || "").trim();
    if (actorRole === "admin") {
      if (!normalizedProvided || normalizedProvided === "all") {
        return "all";
      }
      if (isValidDepartment && !isValidDepartment(normalizedProvided)) {
        throw { status: 400, error: "Department scope is invalid." };
      }
      return normalizedProvided;
    }
    if (!actorDepartment) {
      return "all";
    }
    return actorDepartment;
  }

  async function listStudentDepartmentRows() {
    return all(
      `
        SELECT auth_id, department
        FROM auth_roster
        WHERE role = 'student'
        ORDER BY auth_id ASC
      `
    );
  }

  function rowMatchesStudentDepartmentScope(row, studentDepartment) {
    if (!row || typeof row !== "object") {
      return false;
    }
    return departmentScopeMatchesStudent(String(row.target_department || ""), studentDepartment);
  }

  return {
    ensureCanManageContent,
    assertStudentContentAccess,
    getRosterUserDepartment,
    getSessionUserDepartment,
    resolveContentTargetDepartment,
    listStudentDepartmentRows,
    rowMatchesStudentDepartmentScope,
  };
}

module.exports = {
  createContentAccessService,
};
