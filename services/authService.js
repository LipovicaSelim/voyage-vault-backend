const admin = require("../config/firebase");
const pool = require("../config/db");

exports.signup = async (email, password) => {
  try {
    const firebaseUser = await admin.auth().createUser({
      email,
      password,
      emailVerified: false,
      disabled: false,
    });

    const [result] = await pool.query(
      "INSERT INTO users (email, firebase_uid) VALUES (?, ?)",
      [email, firebaseUser.uid]
    );

    return {
      id: result.insertId,
      email,
      firebaseUid: firebaseUser.uid,
    };
  } catch (err) {
    console.error("AuthService Error Details:", {
      message: err.message,
      code: err.code,
      stack: err.stack,
    });

    if (err.code === "ER_NO_DB_ERROR" && firebaseUser) {
      await admin.auth().deleteUser(firebaseUser.uid);
    }

    throw err;
  }
};
