const { registerStaticHtmlPageRoutes } = require("../../lib/server/pages/static-page-registry");

function registerPageRoutes(app, deps) {
  const { path, PROJECT_ROOT, requireAuth, requireTeacher, requireTeacherOnly, requireNonAdmin } = deps;

  registerStaticHtmlPageRoutes(app, {
    path,
    projectRoot: PROJECT_ROOT,
    guards: {
      requireAuth,
      requireTeacher,
      requireTeacherOnly,
      requireNonAdmin,
    },
  });
}

module.exports = {
  registerPageRoutes,
};

