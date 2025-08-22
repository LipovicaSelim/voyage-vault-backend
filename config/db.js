const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DB || "voyage_vault",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  Promise: Promise,
});

// Test the connection
pool
  .query("SELECT 1 + 1 AS solution")
  .then(([rows]) => console.log("MySQL connection test:", rows[0].solution))
  .catch((err) => console.error("MySQL connection failed:", err));

module.exports = { pool };
