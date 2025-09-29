// controllers/authController.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { ADMIN_EMAILS } from "../config/adminEmails.js";

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// 🔹 Register
export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "User already exists" });

    // auto-assign role based on email
    const role = ADMIN_EMAILS.includes(email) ? "admin" : "user";

    const user = await User.create({ name, email, password, role });
    const token = generateToken(user);

    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
};

// 🔹 Login
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // ensure role is synced if email is admin
    if (ADMIN_EMAILS.includes(user.email) && user.role !== "admin") {
      user.role = "admin";
      await user.save();
    }

    const token = generateToken(user);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
};
