function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Login required' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'Not authorized' });
    next();
  };
}

module.exports = { requireLogin, requireRole };
