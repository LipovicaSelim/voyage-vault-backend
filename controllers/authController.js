const authService = require("../services/authService");

exports.signup = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await authService.signup(email, password);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
