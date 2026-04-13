const STATIC_HTML_ROUTES = Object.freeze([
  { paths: ["/", "/index.html"], file: "index.html", guard: "requireAuth" },
  { paths: ["/notifications.html"], file: "notifications.html", guard: "requireAuth" },
  { paths: ["/handouts.html"], file: "handouts.html", guard: "requireAuth" },
  { paths: ["/payments", "/payments.html"], file: "payments.html", guard: "requireNonAdmin" },
  { paths: ["/messages", "/messages.html"], file: "messages.html", guard: "requireNonAdmin" },
  { paths: ["/profile", "/profile.html"], file: "profile.html", guard: "requireAuth" },
  { paths: ["/analytics"], file: "analytics.html", guard: "requireTeacher" },
  { paths: ["/lecturer", "/teacher", "/lecturer.html", "/teacher.html"], file: "lecturer.html", guard: "requireTeacherOnly" },
]);

function registerStaticHtmlPageRoutes(app, options = {}) {
  const path = options.path;
  const projectRoot = options.projectRoot;
  const guards = options.guards || {};

  if (!app || typeof app.get !== "function") {
    throw new Error("registerStaticHtmlPageRoutes requires an Express app.");
  }
  if (!path || typeof path.join !== "function") {
    throw new Error("registerStaticHtmlPageRoutes requires path.");
  }
  if (!projectRoot) {
    throw new Error("registerStaticHtmlPageRoutes requires projectRoot.");
  }

  STATIC_HTML_ROUTES.forEach((route) => {
    const handlers = [];
    if (route.guard) {
      const guard = guards[route.guard];
      if (typeof guard !== "function") {
        throw new Error(`Missing guard "${route.guard}" for static page route registration.`);
      }
      handlers.push(guard);
    }
    handlers.push((_req, res) => {
      res.sendFile(path.join(projectRoot, route.file));
    });
    app.get(route.paths, ...handlers);
  });
}

module.exports = {
  STATIC_HTML_ROUTES,
  registerStaticHtmlPageRoutes,
};
