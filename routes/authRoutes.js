const express = require("express");
const router = express.Router();
const {
  signup,
  verifyCodeHandler,
  googleSignInHandler,
  googleCallbackHandler,
  verifyGoogleHandler,
  resendCodeHandler,
  refreshTokenHandler,
  logoutHandler,
  initiateSignInHandler,
  verifySignInCodeHandler,
} = require("../controllers/authController");
const { authenticateToken } = require("../middlewares/auth");
const rateLimit = require("express-rate-limit");

// Rate limiter for signup endpoint: 5 attempts per 15 minutes per IP
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message:
    "Too many signup attempts from this IP, please try again after 15 minutes.",
});


const resendCodeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: "Too many resend attempts, please try again after 5 minutes.",
});

router.post("/signup", signup);

router.post("/verify-code", verifyCodeHandler);

router.post("/google-signin", googleSignInHandler);

router.get("/google-callback", googleCallbackHandler);

router.get("/verify-google", verifyGoogleHandler);
router.get("/", authenticateToken, (req, res) =>
  res.status(200).json({ message: "Protected route", user: req.user })
);

router.post("/resend-code", resendCodeLimiter, resendCodeHandler);

router.post("/refresh-token", refreshTokenHandler);

router.post("/logout", logoutHandler);

router.post("/signin", signupLimiter, initiateSignInHandler);

router.post("/signin-verify", verifySignInCodeHandler);

module.exports = router