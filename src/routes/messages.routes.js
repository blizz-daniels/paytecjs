function registerMessageRoutes(app, deps) {
  const {
    requireAuth,
    parseResourceId,
    getSessionUserDepartment,
    messageService,
  } = deps;

  app.get("/api/messages/threads", requireAuth, async (req, res) => {
    try {
      const username = String(req.session?.user?.username || "").trim();
      if (!username) {
        return res.status(401).json({ error: "Authentication required." });
      }
      const [threads, unread] = await Promise.all([
        messageService.listMessageThreadSummariesForUser(username),
        messageService.getMessageUnreadCounts(username),
      ]);
      return res.json({ threads, unread });
    } catch (_err) {
      return res.status(500).json({ error: "Could not load message threads." });
    }
  });

  app.get("/api/messages/threads/:id", requireAuth, async (req, res) => {
    try {
      const threadId = parseResourceId(req.params.id);
      if (!threadId) {
        return res.status(400).json({ error: "Invalid message thread ID." });
      }
      const username = String(req.session?.user?.username || "").trim();
      if (!username) {
        return res.status(401).json({ error: "Authentication required." });
      }
      const payload = await messageService.getMessageThreadPayloadForUser(threadId, username);
      return res.json(payload);
    } catch (err) {
      if (err && err.status && err.error) {
        return res.status(err.status).json({ error: err.error });
      }
      return res.status(500).json({ error: "Could not load message thread." });
    }
  });

  app.post("/api/messages/threads", requireAuth, async (req, res) => {
    try {
      const actorRole = String(req.session?.user?.role || "").trim().toLowerCase();
      const payload = await messageService.createThread({
        actorRole,
        actorUsername: req.session?.user?.username || "",
        actorDepartment: await getSessionUserDepartment(req),
        subject: req.body?.subject || "",
        message: req.body?.message || "",
        recipients: req.body?.recipients,
      });
      return res.status(201).json(payload);
    } catch (err) {
      if (err && err.status && err.error) {
        return res.status(err.status).json({ error: err.error });
      }
      return res.status(500).json({ error: "Could not create message thread." });
    }
  });

  app.post("/api/messages/threads/:id/messages", requireAuth, async (req, res) => {
    try {
      const threadId = parseResourceId(req.params.id);
      if (!threadId) {
        return res.status(400).json({ error: "Invalid message thread ID." });
      }
      const payload = await messageService.createMessage({
        threadId,
        actorUsername: req.session?.user?.username || "",
        actorRole: req.session?.user?.role || "",
        message: req.body?.message || "",
      });
      return res.status(201).json(payload);
    } catch (err) {
      if (err && err.status && err.error) {
        return res.status(err.status).json({ error: err.error });
      }
      return res.status(500).json({ error: "Could not send message." });
    }
  });

  app.post("/api/messages/threads/:id/read", requireAuth, async (req, res) => {
    try {
      const threadId = parseResourceId(req.params.id);
      if (!threadId) {
        return res.status(400).json({ error: "Invalid message thread ID." });
      }
      const username = String(req.session?.user?.username || "").trim();
      if (!username) {
        return res.status(401).json({ error: "Authentication required." });
      }
      await messageService.getMessageThreadAccess(threadId, username);
      const lastReadMessageId = await messageService.markMessageThreadReadForUser(threadId, username);
      const unread = await messageService.getMessageUnreadCounts(username);
      return res.json({
        ok: true,
        thread_id: threadId,
        last_read_message_id: lastReadMessageId,
        unread,
      });
    } catch (err) {
      if (err && err.status && err.error) {
        return res.status(err.status).json({ error: err.error });
      }
      return res.status(500).json({ error: "Could not update read state." });
    }
  });

  app.get("/api/messages/unread-count", requireAuth, async (req, res) => {
    try {
      const username = String(req.session?.user?.username || "").trim();
      if (!username) {
        return res.status(401).json({ error: "Authentication required." });
      }
      const unread = await messageService.getMessageUnreadCounts(username);
      return res.json(unread);
    } catch (_err) {
      return res.status(500).json({ error: "Could not load unread count." });
    }
  });

  app.get("/api/messages/students", requireAuth, async (req, res) => {
    try {
      const actorRole = String(req.session?.user?.role || "").trim().toLowerCase();
      if (!messageService.canCreateMessageThreads(actorRole)) {
        return res.status(403).json({ error: "Only lecturers or admins can list student recipients." });
      }
      const students = await messageService.listMessageStudentDirectory({
        actorRole,
        actorDepartment: await getSessionUserDepartment(req),
      });
      return res.json({ students });
    } catch (_err) {
      return res.status(500).json({ error: "Could not load students." });
    }
  });
}

module.exports = {
  registerMessageRoutes,
};
