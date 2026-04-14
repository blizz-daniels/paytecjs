const { createSharedFileService } = require("../lib/server/shared-files");

describe("shared file service", () => {
  function buildService(overrides = {}) {
    const all = overrides.all || jest.fn(async () => []);
    const run = overrides.run || jest.fn(async () => ({ lastID: 101 }));
    return {
      all,
      run,
      service: createSharedFileService({
        all,
        run,
        parseReactionDetails: overrides.parseReactionDetails || (() => []),
        normalizeIdentifier: overrides.normalizeIdentifier || ((value) => String(value || "").trim().toLowerCase()),
        ensureCanManageContent:
          overrides.ensureCanManageContent ||
          jest.fn(async () => ({
            row: { created_by: "teach_001", title: "Old shared file", file_url: "/content-files/shared/old.png" },
          })),
        logAuditEvent: overrides.logAuditEvent || jest.fn(async () => null),
        broadcastContentUpdate: overrides.broadcastContentUpdate || jest.fn(),
        removeStoredContentFile: overrides.removeStoredContentFile || jest.fn(async () => null),
        isValidHttpUrl: overrides.isValidHttpUrl || ((url) => String(url || "").startsWith("https://")),
        isValidLocalContentUrl:
          overrides.isValidLocalContentUrl || ((url) => String(url || "").startsWith("/content-files/")),
        departmentScopeMatchesStudent:
          overrides.departmentScopeMatchesStudent ||
          ((target, student) => String(target || "all").trim().toLowerCase() === "all" || target === student),
      }),
    };
  }

  test("creates shared file and returns ok payload", async () => {
    const { service, run } = buildService();
    const payload = await service.createSharedFile({
      req: {},
      actorUsername: "teach_001",
      title: "Class update",
      description: "Slides and video",
      fileUrl: "/content-files/shared/file-1.png",
      targetDepartment: "science",
    });

    expect(payload).toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO shared_files"), [
      "Class update",
      "Slides and video",
      "/content-files/shared/file-1.png",
      "science",
      "teach_001",
    ]);
  });

  test("rejects invalid URL on update", async () => {
    const { service } = buildService({
      isValidHttpUrl: () => false,
      isValidLocalContentUrl: () => false,
    });

    await expect(
      service.updateSharedFile({
        id: 1,
        actorUsername: "teach_001",
        title: "Updated title",
        description: "Updated description",
        fileUrl: "ftp://bad-link.example.com/file",
        targetDepartment: "science",
      })
    ).rejects.toMatchObject({
      status: 400,
      error: "File URL must start with http://, https://, or /content-files/.",
    });
  });

  test("blocks student reaction outside department scope", async () => {
    const { service } = buildService({
      all: jest.fn(async (sql) => {
        if (String(sql).includes("FROM shared_files")) {
          return [{ id: 45, target_department: "engineering" }];
        }
        return [];
      }),
      departmentScopeMatchesStudent: () => false,
    });

    await expect(
      service.saveReaction({
        id: 45,
        actorUsername: "std_001",
        actorRole: "student",
        actorDepartment: "science",
        reaction: "like",
      })
    ).rejects.toMatchObject({
      status: 403,
      error: "You do not have access to this shared file.",
    });
  });
});
