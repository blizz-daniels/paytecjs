function isAuthenticated(req) {
  return !!(req && req.session && req.session.user);
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }
  return res.redirect("/login");
}

function requireAdmin(req, res, next) {
  if (isAuthenticated(req) && req.session.user && req.session.user.role === "admin") {
    return next();
  }
  return res.status(403).redirect("/");
}

function requireTeacher(req, res, next) {
  if (!isAuthenticated(req) || !req.session.user) {
    return res.status(401).redirect("/login");
  }
  if (req.session.user.role === "teacher" || req.session.user.role === "admin") {
    return next();
  }
  return res.status(403).redirect("/");
}

function requireTeacherOnly(req, res, next) {
  if (!isAuthenticated(req) || !req.session.user) {
    return res.status(401).redirect("/login");
  }
  if (req.session.user.role === "teacher") {
    return next();
  }
  return res.redirect(req.session.user.role === "admin" ? "/admin" : "/");
}

function requireNonAdmin(req, res, next) {
  if (!isAuthenticated(req) || !req.session.user) {
    return res.status(401).redirect("/login");
  }
  if (req.session.user.role !== "admin") {
    return next();
  }
  return res.redirect("/admin");
}

function requireStudent(req, res, next) {
  if (!isAuthenticated(req) || !req.session.user) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (req.session.user.role === "student") {
    return next();
  }
  return res.status(403).json({ error: "Only students can perform this action." });
}

function isAdminSession(req) {
  return !!(req && req.session && req.session.user && req.session.user.role === "admin");
}

module.exports = {
  isAuthenticated,
  requireAuth,
  requireAdmin,
  requireTeacher,
  requireTeacherOnly,
  requireNonAdmin,
  requireStudent,
  isAdminSession,
};
