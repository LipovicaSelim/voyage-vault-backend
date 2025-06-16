const admin = require("../config/firebase");
const pool = require("../config/db");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { OAuth2Client } = require("google-auth-library");
const { sendVerificationEmail } = require("../utils/sendVerificationEmail");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:5000/api/auth/google-callback"
);

// Generate a 6-digit code
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateTokens = (userId) => {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = jwt.sign(
    { userId, iat: now, exp: now + 15 * 60 },
    process.env.JWT_SECRET
  );
  const refreshToken = jwt.sign(
    { userId, iat: now, exp: now + 7 * 24 * 60 * 60 },
    process.env.JWT_SECRET
  );
  console.log(
    "Token issued at:",
    new Date(now * 1000).toISOString(),
    "Expires at:",
    new Date((now + 15 * 60) * 1000).toISOString()
  );
  return { accessToken, refreshToken };
};

// Sign-Up
const initiateSignUp = async (firstName, lastName, email) => {
  const connection = await pool.getConnection();
  try {
    const [existingUsers] = await connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      const user = existingUsers[0];
      if (user.verified) {
        throw new Error(
          "This email is already registered and verified. Please log in."
        );
      } else {
        // Unverified user: resend code
        const verificationCode = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await connection.query(
          "INSERT INTO codes (email, code, expires_at, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE code = ?, expires_at = ?, created_at = ?",
          [
            email,
            verificationCode,
            expiresAt,
            new Date(),
            verificationCode,
            expiresAt,
            new Date(),
          ]
        );
        await sendVerificationEmail(email, verificationCode);
        return { message: "Verification code resent", email };
      }
    }

    // New user: insert into users and codes
    const verificationCode = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await connection.query(
      "INSERT INTO users (firstName, lastName, email, verified, created_at, updated_at, signup_method) VALUES (?, ?, ?, FALSE, ?, ?, ?)",
      [firstName, lastName, email, new Date(), new Date(), "email"]
    );
    await connection.query(
      "INSERT INTO codes (email, code, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [email, verificationCode, expiresAt, new Date()]
    );
    await sendVerificationEmail(email, verificationCode);
    return { message: "Verification code sent", email };
  } catch (error) {
    console.error("Initiate sign-up error:", error.message);
    throw new Error(error.message);
  } finally {
    connection.release();
  }
};

// Verify code and complete the full sign-up
const verifyCode = async (email, code) => {
  const connection = await pool.getConnection();
  try {
    console.log("Verifying code for:", email, "with the code: ", code);
    const [codeRows] = await connection.query(
      "SELECT * FROM codes WHERE email = ? AND code = ? AND expires_at > NOW()",
      [email, code]
    );

    if (codeRows.length === 0) {
      throw new Error("Invalid or expired code");
    }

    const [user] = await connection.query(
      "SELECT id, firstName, lastName, email, profilePicture FROM users WHERE email = ?",
      [email]
    );
    const { accessToken, refreshToken } = generateTokens(user[0].id);

    console.log("Updating user verification for: ", email);
    await connection.query("UPDATE users SET verified = TRUE WHERE email = ?", [
      email,
    ]);

    console.log("Deleting used code for: ", email);
    await connection.query("DELETE FROM codes WHERE email = ?", [email]);

    return {
      message: "Sign-up completed successfully",
      email,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profilePicture: user.profilePicture || null,
      },
      tokens: { accessToken, refreshToken },
    };
  } catch (error) {
    console.log("Error display: ", error.message);
    throw new Error(error.message);
  } finally {
    connection.release();
  }
};

const googleSignIn = async (idToken) => {
  const connection = await pool.getConnection();
  try {
    console.log("Verifying Google ID token");
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const givenName = payload.given_name || null;
    const familyName = payload.family_name || null;
    const profilePicture = payload.picture || null;

    if (!email) {
      throw new Error("Email not found in Google Token");
    }

    console.log("Checking existing user for:", email);
    const [existingUser] = await connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    let userId;
    if (existingUser.length > 0) {
      await connection.query(
        "UPDATE users SET verified = TRUE, signup_method = 'google' WHERE email = ?",
        [email]
      );
      console.log("User already exists, updated verification:", email);
      userId = existingUser[0].id;
    } else {
      console.log("Inserting a new user from Google Sign-In", email);
      const [result] = await connection.query(
        "INSERT INTO users (firstName, lastName, email, verified, signup_method) VALUES (?, ?, ?, ?, ?)",
        [givenName, familyName, email, true, "google"]
      );
      userId = result.insertId;
    }

    const { accessToken, refreshToken } = generateTokens(userId);
    const [users] = await connection.query(
      "SELECT id, firstName, lastName, email FROM users WHERE id = ?",
      [userId]
    );
    const user = users[0];
    return {
      message: "Google sign-in successful",
      email,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profilePicture: user.profilePicture || null,
      },
      tokens: { accessToken, refreshToken },
    };
  } catch (error) {
    console.log("Google sign in error:", error.message);
    throw new Error(`Google Sign In failed: ${error.message}`);
  } finally {
    connection.release();
  }
};

const handleGoogleCallback = async (code) => {
  const connection = await pool.getConnection();
  try {
    console.log("Exchanging authorization code for tokens");
    const { tokens } = await client.getToken({
      code: code,
      redirect_uri: "http://localhost:5000/api/auth/google-callback",
    });

    const idToken = tokens.id_token;
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;

    if (!email) {
      throw new Error("Email not found in Google Token");
    }

    console.log("Checking existing user for:", email);
    const [existingUser] = await connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    let userId;
    if (existingUser.length > 0) {
      await connection.query(
        "UPDATE users SET verified = TRUE, signup_method = 'google' WHERE email = ?",
        [email]
      );
      console.log("User already exists, updated verification:", email);
      userId = existingUser[0].id;
    } else {
      console.log("Inserting a new user from Google Callback", email);
      const [result] = await connection.query(
        "INSERT INTO users (email, verified, signup_method) VALUES (?, ?, ?)",
        [email, true, "google"]
      );
      userId = result.insertId;
    }

    const { accessToken, refreshToken } = generateTokens(userId);
    return {
      message: "Google sign-in successful",
      email,
      tokens: { accessToken, refreshToken },
    };
  } catch (error) {
    console.log("Google callback error:", error.message);
    throw new Error(`Google Callback failed: ${error.message}`);
  } finally {
    connection.release();
  }
};

const verifyGoogle = async (email) => {
  const connection = await pool.getConnection();
  try {
    const [user] = await connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (user.length > 0) {
      return { isGoogle: user[0].signup_method === "google", email };
    }
    return { isGoogle: false, email };
  } catch (error) {
    console.log("Verify Google error:", error.message);
    throw new Error(`Verification failed: ${error.message}`);
  } finally {
    connection.release();
  }
};

const resendCode = async (email) => {
  const connection = await pool.getConnection();
  try {
    // Check if the user exists
    const [existingUsers] = await connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length === 0) {
      throw new Error("User not found");
    }

    const user = existingUsers[0];
    if (user.verified) {
      throw new Error("User is already verified");
    }

    const verificationCode = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await connection.query(
      `INSERT INTO codes (email, code, expires_at, created_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE code = ?, expires_at = ?, created_at = ?`,
      [
        email,
        verificationCode,
        expiresAt,
        new Date(),
        verificationCode,
        expiresAt,
        new Date(),
      ]
    );

    await sendVerificationEmail(email, verificationCode);

    return { message: "Verification code resent", email };
  } catch (error) {
    console.error("Resend code error:", error.message);
    throw new Error(error.message);
  } finally {
    connection.release();
  }
};

const cleanupUnverifiedUsers = async () => {
  let connection;

  try {
    connection = await pool.getConnection();
    console.log("Cleaning the users which have not verified...");
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [deletedUsers] = await connection.query(
      "DELETE FROM users WHERE verified = FALSE AND created_at < ?",
      [oneDayAgo]
    );
    console.log(`Deleted ${deletedUsers.affectedRows} unverified users.`);
  } catch (error) {
    console.error("Cleanup unverified users error", error.message);
  } finally {
    if (connection) connection.release();
  }
};

const initiateSignIn = async (email) => {
  const connection = await pool.getConnection();
  try {
    const [existingUsers] = await connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length === 0) {
      throw new Error("User not found. Please sign up");
    }

    const user = existingUsers[0];
    if (!user.verified) {
      throw new Error(
        "Please complete signup by verifying your email. Use the signup page to resume."
      );
    }

    const verificationCode = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await connection.query(
      "INSERT INTO codes  (email, code, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code = ?, expires_at = ?",
      [email, verificationCode, expiresAt, verificationCode, expiresAt]
    );

    await sendVerificationEmail(email, verificationCode);

    return { message: "Sign-in code sent", email };
  } catch (error) {
    console.error("Initiate sign-in error: ", error.message);
    throw new Error(error.message);
  } finally {
    connection.release();
  }
};

const verifySignInCode = async (email, code) => {
  const connection = await pool.getConnection();
  try {
    const [existingUsers] = await connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length === 0) {
      throw new Error("User not found");
    }

    const user = existingUsers[0];
    if (!user.verified) {
      throw new Error("User not verified");
    }

    const [codeRows] = await connection.query(
      "SELECT * FROM codes WHERE email = ? AND code = ?",
      [email, code]
    );

    if (codeRows.length === 0) {
      throw new Error("Invalid or expired code");
    }

    const codeEntry = codeRows[0];
    if (new Date(codeEntry.expires_at) < new Date()) {
      throw new Error("Code has expired");
    }

    const { accessToken, refreshToken } = generateTokens(user.id);
    return {
      message: "Sign-in successful",
      email,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profilePicture: user.profilePicture || null,
      },
      tokens: { accessToken, refreshToken },
    };
  } catch (error) {
    console.error("Verify sign-in code error:", error.message);
    throw new Error(error.message);
  } finally {
    connection.release();
  }
};

const verifyToken = async (req, res) => {
  const accessToken = req.cookies.accessToken;
  if (!accessToken) {
    throw new Error("Access token missing");
  }

  try {
    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    const connection = await pool.getConnection();
    const [users] = await connection.query(
      "SELECT id, firstName, lastName, email, profilePicture FROM users WHERE id = ?",
      [decoded.userId]
    );
    connection.release();
    if (users.length === 0) throw new Error("User not found");
    const user = users[0];
    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profilePicture: user.profilePicture || null,
      },
      isValid: true,
    };
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        throw new Error("Refresh token missing");
      }

      try {
        const user = jwt.verify(refreshToken, process.env.JWT_SECRET);
        const { accessToken: newAccessToken } = generateTokens(user.userId);
        res.cookie("accessToken", newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "Strict",
          maxAge: 15 * 60 * 1000,
        });
        const connection = await pool.getConnection();
        const [users] = await connection.query(
          "SELECT id, firstName, lastName, email FROM users WHERE id = ?",
          [user.userId]
        );
        connection.release();
        if (users.length === 0) throw new Error("User not found");
        const refreshedUser = users[0];
        return {
          user: {
            id: refreshedUser.id,
            firstName: refreshedUser.firstName,
            lastName: refreshedUser.lastName,
            email: refreshedUser.email,
            profilePicture: user.profilePicture || null,
          },
          isValid: true,
        };
      } catch (refreshError) {
        throw new Error("Invalid or expired refresh token");
      }
    }
    throw new Error("Invalid access token");
  }
};

module.exports = {
  initiateSignUp,
  verifyCode,
  googleSignIn,
  handleGoogleCallback,
  verifyGoogle,
  generateTokens,
  resendCode,
  cleanupUnverifiedUsers,
  initiateSignIn,
  verifySignInCode,
  verifyToken,
};
