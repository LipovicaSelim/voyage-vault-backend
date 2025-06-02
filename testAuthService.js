const { initiateSignUp, verifyCode } = require("./services/authService.js");
require("dotenv").config();

console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS:", process.env.EMAIL_PASS);

async function testSignUp() {
  try {
    // const signUpResult = await initiateSignUp("selim.lipovica@outlook.com");
    // console.log("Test result: ", signUpResult);
    const verifyResult = await verifyCode(
      "selim.lipovica@outlook.com",
      "131157"
    );
    console.log("Verify result: ", verifyResult);
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testSignUp();
