const User = require('../models/User');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/app.config');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.email,
    pass: config.password,
  },
});

async function sendOtpMail(to, subject, title, otp) {
  await transporter.sendMail({
    from: config.mailFrom || config.email,
    to,
    subject,
    html: `
      <h2>${title}</h2>
      <p>Your OTP is:</p>
      <h1 style="letter-spacing: 8px;">${otp}</h1>
      <p>Valid for 5 minutes.</p>
    `,
  });
}

exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (await User.findOne({ email })) {
      return res.status(400).json({ msg: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = crypto.randomInt(100000, 999999).toString();

    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: 'user',               
      otp,
      otpExpire: Date.now() + 5 * 60 * 1000,
    });

    await user.save();

    await sendOtpMail(email, 'Your OTP for Trade Point', 'Email Verification', otp);

    res.json({ msg: 'OTP sent to your email', email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ msg: 'Invalid email' });
    if (user.otp !== otp || user.otpExpire < Date.now()) {
      return res.status(400).json({ msg: 'OTP invalid or expired' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpire = undefined;
    await user.save();

    res.json({ msg: 'Account verified. You can now login.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ msg: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ msg: 'If this email is registered, reset OTP has been sent.' });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    user.resetOtp = otp;
    user.resetOtpExpire = Date.now() + 5 * 60 * 1000;
    await user.save();

    await sendOtpMail(email, 'Trade Point Password Reset OTP', 'Password Reset', otp);

    return res.json({ msg: 'Reset OTP sent to your email.' });
  } catch (err) {
    console.error('requestPasswordReset error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ msg: 'Email, OTP and new password are required' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ msg: 'New password must be at least 6 characters' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid email or OTP' });
    }

    if (!user.resetOtp || user.resetOtp !== otp || !user.resetOtpExpire || user.resetOtpExpire < Date.now()) {
      return res.status(400).json({ msg: 'OTP invalid or expired' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetOtp = undefined;
    user.resetOtpExpire = undefined;
    await user.save();

    return res.json({ msg: 'Password reset successful. Please login.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user)
      return res.status(400).json({ msg: 'Invalid credentials' });
    if (!user.isVerified)
      return res.status(403).json({ msg: 'Please verify your email first' });
    if (!await bcrypt.compare(password, user.password)) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiry }
    );

    res.json({
      msg: 'Login successful',
      token,
      role: user.role
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};
