const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const authMiddleware = async (req, res, next) => {
  // console.log("Auth middleware started");
  // console.log("Received cookies:", req.cookies);
  const accessToken = req.cookies.accessToken;
  if (!accessToken) {
    console.log("Access token missing");
    return res.status(401).json({ message: "Access token missing" });
  }

  try {
    // console.log("Verifying access token");
    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    // console.log("Token decoded:", decoded);
    const connection = await pool.getConnection();
    console.log("Database connection acquired");
    const [users] = await connection.query(
      "SELECT id, firstName, lastName, email, profilePicture FROM users WHERE id = ?",
      [decoded.userId]
    );
    // console.log("Query result:", users);
    connection.release();
    if (users.length === 0) throw new Error("User not found");
    const user = users[0];
    req.user = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profilePicture: user.profilePicture || null,
    };
    // console.log("req.user set:", req.user);
    next();
  } catch (error) {
    console.log("Verify token error:", error.message, "Stack:", error.stack);
    if (error.name === "TokenExpiredError") {
      console.log("Token expired, attempting refresh");
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        console.log("Refresh token missing");
        return res.status(401).json({ message: "Refresh token missing" });
      }

      try {
        console.log("Verifying refresh token");
        const user = jwt.verify(refreshToken, process.env.JWT_SECRET);
        // console.log("Refresh token decoded:", user);
        const { accessToken: newAccessToken } = generateTokens(user.userId);
        res.cookie("accessToken", newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV !== "production",
          sameSite: "Strict",
          maxAge: 15 * 60 * 1000,
        });
        console.log("New access token set");
        const connection = await pool.getConnection();
        const [users] = await connection.query(
          "SELECT id, firstName, lastName, email FROM users WHERE id = ?",
          [user.userId]
        );
        connection.release();
        if (users.length === 0) throw new Error("User not found");
        const refreshedUser = users[0];
        req.user = {
          id: refreshedUser.id,
          firstName: refreshedUser.firstName,
          lastName: refreshedUser.lastName,
          email: refreshedUser.email,
          profilePicture: user.profilePicture || null,
        };
        // console.log("Refreshed req.user set:", req.user);
        next();
      } catch (refreshError) {
        console.log(
          "Refresh error:",
          refreshError.message,
          "Stack:",
          refreshError.stack
        );
        return res
          .status(401)
          .json({ message: "Invalid or expired refresh token" });
      }
    }
    return res.status(401).json({ message: "Invalid access token" });
  }
};

module.exports = authMiddleware;
