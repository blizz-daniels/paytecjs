function registerPageRoutes(app, deps) {
  const {
    path,
    PROJECT_ROOT,
    requireAuth,
    requireTeacher,
    requireTeacherOnly,
    requireNonAdmin,
  } = deps;

  app.get("/", requireAuth, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "index.html"));
  });

  app.get("/index.html", requireAuth, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "index.html"));
  });

  app.get("/notifications.html", requireAuth, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "notifications.html"));
  });

  app.get("/handouts.html", requireAuth, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "handouts.html"));
  });

  app.get("/payments", requireNonAdmin, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "payments.html"));
  });

  app.get("/payments.html", requireNonAdmin, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "payments.html"));
  });

  app.get("/messages", requireNonAdmin, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "messages.html"));
  });

  app.get("/messages.html", requireNonAdmin, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "messages.html"));
  });

  app.get("/profile", requireAuth, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "profile.html"));
  });

  app.get("/profile.html", requireAuth, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "profile.html"));
  });

  app.get("/analytics", requireTeacher, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "analytics.html"));
  });

  app.get(["/lecturer", "/teacher"], requireTeacherOnly, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "lecturer.html"));
  });

  app.get(["/lecturer.html", "/teacher.html"], requireTeacherOnly, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, "lecturer.html"));
  });
}

module.exports = {
  registerPageRoutes,
};

