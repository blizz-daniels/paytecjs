function registerHandoutRoutes(app, deps) {
  const {
    parseResourceId,
    requireAuth,
    requireTeacher,
    handoutUpload,
    getSessionUserDepartment,
    resolveContentTargetDepartment,
    handoutService,
    storeUploadedContentFile,
  } = deps;

  app.get("/api/handouts", requireAuth, async (req, res) => {
    try {
      const actorRole = String(req.session?.user?.role || "").trim().toLowerCase();
      const rows = await handoutService.listHandouts({
        actorUsername: req.session.user.username,
        actorRole,
        actorDepartment: actorRole === "student" ? await getSessionUserDepartment(req) : "",
      });
      return res.json(rows);
    } catch (_err) {
      return res.status(500).json({ error: "Could not load handouts" });
    }
  });

  app.post("/api/handouts", requireTeacher, (req, res) => {
    handoutUpload.single("file")(req, res, async (err) => {
      if (err) {
        const message =
          err && err.message === "Only PDF, Word, and Excel files are allowed for handouts."
            ? err.message
            : err && err.code === "LIMIT_FILE_SIZE"
            ? "Handout file cannot be larger than 20 MB."
            : "Could not process handout upload.";
        return res.status(400).json({ error: message });
      }

      const title = String(req.body.title || "").trim();
      const description = String(req.body.description || "").trim();
      if (!title || !description) {
        return res.status(400).json({ error: "Title and description are required." });
      }
      if (title.length > 120 || description.length > 2000) {
        return res.status(400).json({ error: "Handout field length is invalid." });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Please select a handout file to upload." });
      }

      try {
        const targetDepartment = await resolveContentTargetDepartment(req, req.body?.targetDepartment || "");
        const uploaded = await storeUploadedContentFile({
          req,
          category: "handouts",
          actorUsername: req.session.user.username,
          actorRole: req.session.user.role,
          file: req.file,
        });
        const payload = await handoutService.createHandout({
          req,
          actorUsername: req.session.user.username,
          title,
          description,
          fileUrl: uploaded.legacyUrl,
          targetDepartment,
        });
        return res.status(201).json(payload);
      } catch (innerErr) {
        if (innerErr && innerErr.status && innerErr.error) {
          return res.status(innerErr.status).json({ error: innerErr.error });
        }
        return res.status(500).json({ error: "Could not save handout." });
      }
    });
  });

  app.put("/api/handouts/:id", requireTeacher, async (req, res) => {
    try {
      const targetDepartment = await resolveContentTargetDepartment(req, req.body?.targetDepartment || "");
      const payload = await handoutService.updateHandout({
        req,
        id: parseResourceId(req.params.id),
        actorUsername: req.session.user.username,
        isAdmin: req.session.user.role === "admin",
        title: req.body.title,
        description: req.body.description,
        fileUrl: req.body.fileUrl,
        targetDepartment,
      });
      return res.status(200).json(payload);
    } catch (err) {
      if (err && err.status && err.error) {
        return res.status(err.status).json({ error: err.error });
      }
      return res.status(500).json({ error: "Could not update handout." });
    }
  });

  app.delete("/api/handouts/:id", requireTeacher, async (req, res) => {
    try {
      const payload = await handoutService.deleteHandout({
        req,
        id: parseResourceId(req.params.id),
        actorUsername: req.session.user.username,
        isAdmin: req.session.user.role === "admin",
      });
      return res.status(200).json(payload);
    } catch (err) {
      if (err && err.status && err.error) {
        return res.status(err.status).json({ error: err.error });
      }
      return res.status(500).json({ error: "Could not delete handout." });
    }
  });

  app.post("/api/handouts/:id/reaction", requireAuth, async (req, res) => {
    try {
      const actorRole = String(req.session?.user?.role || "").trim().toLowerCase();
      const payload = await handoutService.saveReaction({
        id: parseResourceId(req.params.id),
        actorUsername: req.session.user.username,
        actorRole,
        actorDepartment: actorRole === "student" ? await getSessionUserDepartment(req) : "",
        reaction: req.body.reaction,
      });
      return res.json(payload);
    } catch (err) {
      if (err && err.status && err.error) {
        return res.status(err.status).json({ error: err.error });
      }
      return res.status(500).json({ error: "Could not save reaction." });
    }
  });
}

module.exports = {
  registerHandoutRoutes,
};
