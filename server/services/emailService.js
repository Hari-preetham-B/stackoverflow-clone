import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const sendEmail = async ({ to, subject, text, html }) => {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
};

export const sendPasswordOtpEmail = async (email, otp) => {
  await sendEmail({
    to: email,
    subject: "Stack Overflow Clone - Password Reset OTP",
    text: `Your password reset OTP is ${otp}. This OTP is valid for 10 minutes.`,
    html: `
      <h2>Password Reset</h2>
      <p>Your password reset OTP is:</p>

      <h1>${otp}</h1>

      <p>This OTP is valid for 10 minutes.</p>
      <p>If you did not request a password reset, please ignore this email.</p>
    `,
  });
};

export const sendNewPasswordEmail = async (email, password) => {
  await sendEmail({
    to: email,
    subject: "Stack Overflow Clone - New Password",
    text: `Your new temporary password is: ${password}`,
    html: `
      <h2>Password Reset Successful</h2>

      <p>Your new temporary password is:</p>

      <h1>${password}</h1>

      <p>Please use this password to log in.</p>
      <p>After logging in, change your password from your profile/security settings.</p>
    `,
  });
};
