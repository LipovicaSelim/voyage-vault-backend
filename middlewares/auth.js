const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
  const accessToken = req.cookies.accessToken;
  if (!accessToken)
    return res.status(401).json({ message: "Access token required" });

  jwt.verify(accessToken, process.env.JWT_SECRET, (err, user) => {
    if (err)
      return res
        .status(403)
        .json({ message: "Invalid or expired access token" });
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };
