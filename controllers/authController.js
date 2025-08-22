const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const {
  initiateSignUp,
  verifyCode,
  googleSignIn,
  handleGoogleCallback,
  verifyGoogle,
  generateTokens,
  resendCode,
  initiateSignIn,
  verifySignInCode,
  verifyToken,
} = require("../services/authService");

const signup = async (req, res) => {
  console.log("Signing up started");
  try {
    const { firstName, lastName, email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const result = await initiateSignUp(firstName, lastName, email);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const verifyCodeHandler = async (req, res) => {
  console.log("Verifying started");
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }
    const result = await verifyCode(email, code);

    // Set tokens as HttpOnly cookies
    res.cookie("accessToken", result.tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refreshToken", result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res
      .status(200)
      .json({ message: result.message, email: result.email });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Google Sign-In endpoint
const googleSignInHandler = async (req, res) => {
  console.log("Google Sign-In started");
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "ID token is required" });
    }

    const result = await googleSignIn(idToken);

    res.cookie("accessToken", result.tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refreshToken", result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res
      .status(200)
      .json({ message: result.message, email: result.email });
  } catch (error) {
    console.error("Google Sign-In error:", error.message);
    return res
      .status(400)
      .json({ message: "Google Sign-In failed", error: error.message });
  }
};

const googleCallbackHandler = async (req, res) => {
  console.log("Google Callback started");
  try {
    const { code } = req.query;

    if (!code) {
      return res
        .status(400)
        .json({ message: "Authorization code is required" });
    }

    const result = await handleGoogleCallback(code);

    res.cookie("accessToken", result.tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refreshToken", result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Redirect back to the frontend
    res.redirect(
      `http://localhost:5173/signup?success=true&email=${encodeURIComponent(
        result.email
      )}`
    );
  } catch (error) {
    console.error("Google Callback error:", error.message);
    res.redirect(
      "http://localhost:5173/signup?error=" + encodeURIComponent(error.message)
    );
  }
};

const verifyGoogleHandler = async (req, res) => {
  const { email } = req.query;
  try {
    const result = await verifyGoogle(email);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const refreshTokenHandler = async (req, res) => {
  console.log("Refresh token request received at:", new Date().toISOString());
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken)
    return res.status(401).json({ message: "Refresh token required" });

  try {
    const user = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const { accessToken } = generateTokens(user.userId);
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000,
    });
    res.status(200).json({ message: "Token refreshed successfully" });
  } catch (error) {
    console.error("Refresh token verification error:", error.message);
    res.status(403).json({ message: "Invalid or expired refresh token" });
  }
};

const resendCodeHandler = async (req, res) => {
  console.log("Resend code request received at:", new Date().toISOString());
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    const result = await resendCode(email);
    res.status(200).json(result);
  } catch (error) {
    console.error("Resend code error:", error.message);
    res.status(400).json({ message: error.message });
  }
};

const logoutHandler = (req, res) => {
  console.log("Logout requerst received at: ", new Date().toISOString());
  res.clearCookie("accessToken", {
    httpOnly: "true",
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  });
  res.clearCookie("refreshToken", {
    httpOnly: "true",
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  });
  res.status(200).json({ message: "Logged out successfully" });
};

const initiateSignInHandler = async (req, res) => {
  console.log("SIgn in request received at: ", new Date().toISOString());

  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    const result = await initiateSignIn(email);
    res.status(200).json(result);
  } catch (error) {
    console.error("Sign in error: ", error.message);
    res.status(400).json({ message: error.message });
  }
};

const verifySignInCodeHandler = async (req, res) => {
  console.log("Sign-in verify request received at:", new Date().toISOString());
  try {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ message: "Email and code are required" });
    const result = await verifySignInCode(email, code);
    res.cookie("accessToken", result.tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refreshToken", result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(200).json({ message: result.message, email: result.email });
  } catch (error) {
    console.error("Sign-in verify error:", error.message);
    res.status(400).json({ message: error.message });
  }
};

const verifyTokenHandler = async (req, res) => {
  try {
    const { user, isValid } = await verifyToken(req, res);
    if (!isValid) {
      throw new Error("Token verification failed");
    }
    res.status(200).json({ message: "Token is valid", user });
  } catch (error) {
    console.error("Verify token error:", error.message);
    res.status(401).json({ message: error.message });
  }
};

const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const fs = require("fs").promises;
const path = require("path");

const updateProfile = async (req, res) => {
  const { email, firstName, lastName } = req.body;
  let profilePicture = null;

  const connection = await pool.getConnection();
  try {
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "voyagevault/profiles",
        });
        profilePicture = result.secure_url;
        await fs.unlink(req.file.path);
      } catch (uploadError) {
        await fs.unlink(req.file.path);
        throw new Error(`Cloudinary upload failed: ${uploadError.message}`);
      }
    }

    const updates = [];
    const values = [];
    if (firstName) {
      updates.push("firstName = ?");
      values.push(firstName);
    }
    if (lastName) {
      updates.push("lastName = ?");
      values.push(lastName);
    }
    if (profilePicture) {
      updates.push("profilePicture = ?");
      values.push(profilePicture);
    }
    values.push(email);

    if (updates.length > 0) {
      await connection.query(
        `UPDATE users SET ${updates.join(", ")} WHERE email = ?`,
        values
      );
    }

    const [users] = await connection.query(
      "SELECT firstName, lastName, email, profilePicture FROM users WHERE email = ?",
      [email]
    );
    const updatedUser = users[0];

    res.status(200).json({
      message: "Profile updated",
      user: {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        profilePicture: updatedUser.profilePicture || null,
      },
    });
  } catch (error) {
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error("Failed to clean up file:", cleanupError.message);
      }
    }
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
};

module.exports = {
  signup,
  verifyCodeHandler,
  googleSignInHandler,
  googleCallbackHandler,
  verifyGoogleHandler,
  refreshTokenHandler,
  resendCodeHandler,
  logoutHandler,
  initiateSignInHandler,
  verifySignInCodeHandler,
  verifyTokenHandler,
  updateProfile,
};
