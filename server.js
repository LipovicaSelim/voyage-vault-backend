const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
require("dotenv").config();
const cron = require("node-cron");
const { cleanupUnverifiedUsers } = require("./services/authService");

const app = express();

// CORS config
const corsOptions = {
  origin: "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// Middleware to parse JSON and urlencoded data
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);
app.use("/images", require("./routes/authRoutes"));
app.use("/api/trips", require("./controllers/tripController"));

cron.schedule("0 0 * * *", async () => {
  console.log("Running scheduled cleanup of unverified users...");
  try {
    await cleanupUnverifiedUsers();
  } catch (error) {
    console.error("Crob job error:  ", error.message);
  }
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
