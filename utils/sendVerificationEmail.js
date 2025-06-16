const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls:
    process.env.NODE_ENV === "production"
      ? undefined
      : { rejectUnauthorized: false },
});

transporter.verify((error, success) => {
  if (error) {
    console.error("Email transporter verification failed:", error.message);
  } else {
    console.log("Email transporter is ready to send emails");
  }
});

const sendVerificationEmail = async (email, code) => {
  const mailOptions = {
    from: `"VoyageVault" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "VoyageVault Verification Code",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>VoyageVault Verification Code</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #F0E9D5; font-family: Arial, Helvetica, sans-serif; color: #3a260e;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color: #668F82; padding: 20px;">
              <img src="cid:logo-svg-format" alt="VoyageVault Logo" style="width: 100px; height: auto; margin-bottom: 20px;" />
              <h1 style="color: #F0E9D5; font-size: 24px; margin: 0;">VoyageVault</h1>
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="font-size: 20px; color:rgb(93, 68, 37); margin-top: 0;">Verify Your Account</h2>
              <p style="font-size: 16px; color: #5E5E5E; line-height: 1.5;">
                Thank you for joining VoyageVault! To complete authentication, please use the verification code below:
              </p>
              <div style="text-align: center; margin: 20px 0;">
                <span style="display: inline-block; background-color: #668F82; letter-spacing: 0.5em; color: #F0E9D5; font-size: 28px; font-weight: bold; padding: 15px 25px; border-radius: 8px;">
                  ${code}
                </span>
              </div>
              <p style="font-size: 16px; color: #5E5E5E; line-height: 1.5;">
                This code will expire in 10 minutes. If you didn’t request this, please contact our support team at <a href="mailto:support@voyagevault.com" style="color: #668F82; text-decoration: none;">support@voyagevault.com</a>.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 20px; background-color: #E4DCC3; font-size: 12px; color: #5E5E5E;">
              <p style="margin: 0;">© 2025 VoyageVault. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    attachments: [
      {
        filename: "logo-svg-format.svg",
        path: "../logo-svg-format.svg",
        cid: "logo-svg-format",
      },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to ${email} with code ${code}`);
    return true;
  } catch (error) {
    console.error(`Failed to send email to ${email}: ${error.message}`);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

module.exports = { sendVerificationEmail };
