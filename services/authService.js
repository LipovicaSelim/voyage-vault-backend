const admin = require("../config/firebase");
const pool = require("../config/db");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:5000/api/auth/google-callback"
);

// Email transporting configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate a 6-digit code
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send email with the code
const sendVerificationEmail = async (email, code) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "VoyageVault Verification Code",
    text: `Your verification code is: ${code}. It expires in 10 minutes.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
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
const initiateSignUp = async (email) => {
  const connection = await pool.getConnection();
  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email format");
    }

    console.log("Checking existing user for:", email);
    const [existingUsers] = await connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (existingUsers.length > 0) {
      throw new Error("User already exists");
    }

    console.log("Inserting new user:", email);
    await connection.query(
      "INSERT INTO users (email, verified, signup_method) VALUES (?, ?, ?)",
      [email, false, "email"]
    );

    console.log("Generating and storing code for:", email);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await connection.query(
      "INSERT INTO codes (email, code, expires_at) VALUES (?, ?, ?)",
      [email, code, expiresAt]
    );

    console.log("Sending email with code:", code);
    await sendVerificationEmail(email, code);

    return { message: "Verification code sent", email };
  } catch (error) {
    console.error("Error occurred:", error.message);
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
      "SELECT id FROM users WHERE email = ?",
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
      let userId = result.insertId;
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

module.exports = {
  initiateSignUp,
  verifyCode,
  googleSignIn,
  handleGoogleCallback,
  verifyGoogle,
  generateTokens,
};
