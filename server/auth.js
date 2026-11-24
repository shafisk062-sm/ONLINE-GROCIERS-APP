const jwt = require("jsonwebtoken");
const { User, Admin } = require("./models");

function issueToken(id, role) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET must be configured");
  return jwt.sign({ sub: id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function authenticate(roles) {
  return async (req, res, next) => {
    try {
      const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!token) return res.status(401).json({ message: "Please sign in to continue" });
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (roles && !roles.includes(payload.role)) return res.status(403).json({ message: "You do not have permission" });
      const Model = payload.role === "admin" ? Admin : User;
      const account = await Model.findById(payload.sub).select("-password");
      if (!account) return res.status(401).json({ message: "Account no longer exists" });
      req.account = account;
      req.role = payload.role;
      next();
    } catch (error) {
      if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Your session has expired. Please sign in again." });
      }
      next(error);
    }
  };
}

module.exports = { issueToken, authenticate };
