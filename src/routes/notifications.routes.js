function registerNotificationRoutes(app, deps) {
  const {
    requireAuth,
    requireTeacher,
    notificationService,
    parseResourceId,
    getSessionUserDepartment,
  } = deps;

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const actorRole = String(req.session?.user?.role || "").trim().toLowerCase();
      const actorDepartment = actorRole === "student" ? await getSessionUserDepartment(req) : "";
      const rows = await notificationService.listNotifications({
        actorUsername: req.session.user.username,
        actorRole,
        actorDepartment,
      });
      return res.json(rows);
    } catch (_err) {
      return res.status(500).json({ error: "Could not load notifications" });
    }
  });

  app.post("/api/notifications/:id/reaction", requireAuth, async (req, res) => {
    try {
      const actorRole = String(req.session?.user?.role || "").trim().toLowerCase();
      const actorDepartment = actorRole === "student" ? await getSessionUserDepartment(req) : "";
      const payload = await notificationService.saveReaction({
        id: parseResourceId(req.params.id),
        actorUsername: req.session.user.username,
        actorRole,
        actorDepartment,
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

  app.post("/api/notifications", requireTeacher, async (req, res) => {
    try {
      const targetDepartment = await deps.resolveContentTargetDepartment(req, req.body?.targetDepartment || "");
      const payload = await notificationService.createNotification({
        req,
        actorUsername: req.session.user.username,
        title: req.body.title,
        body: req.body.body,
        category: req.body.category,
        isUrgent: req.body.isUrgent,
        isPinned: req.body.isPinned,
        targetDepartment,
      });
      return res.status(201).json(payload);
    } catch (err) {
      if (err && err.status && err.error) {
        return res.status(err.status).json({ error: err.error });
      }
      return res.status(500).json({ error: "Could not save notification." });
    }
  });

  app.put("/api/notifications/:id", requireTeacher, async (req, res) => {
    try {
      const targetDepartment = await deps.resolveContentTargetDepartment(req, req.body?.targetDepartment || "");
      const payload = await notificationService.updateNotification({
        req,
        id: parseResourceId(req.params.id),
        actorUsername: req.session.user.username,
        isAdmin: req.session.user.role === "admin",
        title: req.body.title,
        body: req.body.body,
        category: req.body.category,
        isUrgent: req.body.isUrgent,
        isPinned: req.body.isPinned,
        targetDepartment,
      });
      return res.status(200).json(payload);
    } catch (err) {
      if (err && err.status && err.error) {
        return res.status(err.status).json({ error: err.error });
      }
      return res.status(500).json({ error: "Could not update notification." });
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const payload = await notificationService.markNotificationRead({
        id: parseResourceId(req.params.id),
        actorUsername: req.session.user.username,
        actorRole: req.session.user.role,
        actorDepartment: await getSessionUserDepartment(req),
      });
      return res.status(200).json(payload);
    } catch (err) {
      if (err && err.status && err.error) {
        return res.status(err.status).json({ error: err.error });
      }
      return res.status(500).json({ error: "Could not mark notification as read." });
    }
  });

  app.delete("/api/notifications/:id", requireTeacher, async (req, res) => {
    try {
      const payload = await notificationService.deleteNotification({
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
      return res.status(500).json({ error: "Could not delete notification." });
    }
  });
}

module.exports = {
  registerNotificationRoutes,
};
