const jwt = require("jsonwebtoken");
const {
  initiateSignUp,
  verifyCode,
  googleSignIn,
  handleGoogleCallback,
  verifyGoogle,
  generateTokens,
} = require("../services/authService");

const signup = async (req, res) => {
  console.log("Signing up started");
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const result = await initiateSignUp(email);
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
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is requires" });
  try {
    const result = await initiateSignUp(email);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
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

module.exports = {
  signup,
  verifyCodeHandler,
  googleSignInHandler,
  googleCallbackHandler,
  verifyGoogleHandler,
  refreshTokenHandler,
  resendCodeHandler,
  logoutHandler,
};
