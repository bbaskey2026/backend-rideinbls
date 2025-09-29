import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String }, // ✅ Added phone field (used by frontend)
    role: {
      type: String,
      enum: ["user", "admin", "manager", "driver", "moderator"], // ✅ Extended roles to match frontend
      default: "user",
    },
    isActive: { type: Boolean, default: true }, // ✅ Track if user is active
    lastLoginAt: { type: Date },               // ✅ Track last login timestamp
    avatar: { type: String },                  // ✅ Added avatar field for profile pictures
  },
  { timestamps: true }
);

// Method to compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ✅ Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

export default mongoose.models.User || mongoose.model("User", userSchema);