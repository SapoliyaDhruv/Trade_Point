const nodemailer = require('nodemailer');
const config = require('../config/app.config');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.email,
    pass: config.password
  }
});

exports.sendOtp = async (email, otp) => {
  await transporter.sendMail({
    from: config.mailFrom || config.email,
    to: email,
    subject: 'Email Verification OTP',
    html: `
      <div style="font-family: Arial">
        <h2>Email Verification</h2>
        <p>Your OTP is:</p>
        <h1>${otp}</h1>
        <p>This OTP is valid for 5 minutes.</p>
      </div>
    `
  });
};
