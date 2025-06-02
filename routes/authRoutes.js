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
} = require("../controllers/authController");
const { authenticateToken } = require("../middlewares/auth");

router.post("/signup", signup);

router.post("/verify-code", verifyCodeHandler);

router.post("/google-signin", googleSignInHandler);

router.get("/google-callback", googleCallbackHandler);

router.get("/verify-google", verifyGoogleHandler);
router.get("/", authenticateToken, (req, res) =>
  res.status(200).json({ message: "Protected route", user: req.user })
);

router.post("/resend-code", resendCodeHandler);

router.post("/refresh-token", refreshTokenHandler);

router.post("/logout", logoutHandler);

module.exports = router;
