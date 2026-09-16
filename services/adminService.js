// services/adminService.js
import mongoose from "mongoose";
import BookingPayment from "../models/BookingPayment.js";
import User from "../models/User.js";
import { logger } from "../middleware/logger.js";

class AdminService {
  /**
   * 1. Get Payment Analytics & Financial KPIs
   */
  async getPaymentAnalytics() {
    logger.info("[AdminService] Computing payment analytics and financial KPIs");
    const bookings = await BookingPayment.find().populate("user", "name email mobile");

    let totalRevenue = 0;
    let totalRefunds = 0;
    let refundedCount = 0;
    const statusMap = {};
    const dateMap = {};

    bookings.forEach((b) => {
      const amt = Number(b.totalPrice ?? b.payment?.amount ?? 0);
      const isRefund = b.paymentStatus === "Refunded" || b.refund?.isRefunded;

      if (b.paymentStatus === "Paid" || b.payment?.status === "paid") {
        totalRevenue += amt;
      }

      if (isRefund) {
        const refAmt = Number(b.refund?.refundAmount ?? amt);
        totalRefunds += refAmt;
        refundedCount += 1;
      }

      const s = (b.paymentStatus ?? b.payment?.status ?? "pending").toLowerCase();
      statusMap[s] = (statusMap[s] ?? 0) + 1;

      const dateStr = b.createdAt ? new Date(b.createdAt).toISOString().split("T")[0] : "Today";
      dateMap[dateStr] = (dateMap[dateStr] ?? 0) + amt;
    });

    const netRevenue = Math.max(0, totalRevenue - totalRefunds);
    const totalTransactions = bookings.length;
    const averageBookingValue = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;

    const dailyRevenue = Object.keys(dateMap)
      .sort()
      .slice(-14)
      .map((k) => ({ date: k, revenue: dateMap[k] }));

    const statusDistribution = Object.keys(statusMap).map((k) => ({
      name: k.toUpperCase(),
      value: statusMap[k],
    }));

    return {
      bookings,
      metrics: {
        totalRevenue,
        netRevenue,
        totalRefunds,
        refundedCount,
        averageBookingValue,
        totalTransactions,
      },
      analytics: {
        dailyRevenue,
        statusDistribution,
      },
    };
  }

  /**
   * 2. Get All Users
   */
  async getAllUsers() {
    return await User.find().select("-password").sort({ createdAt: -1 });
  }

  /**
   * 3. Block User
   */
  async blockUser(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid user ID format");
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(id);
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    user.isActive = false;
    user.isBlocked = true;
    await user.save();
    return user;
  }

  /**
   * 4. Unblock User
   */
  async unblockUser(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid user ID format");
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(id);
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    user.isActive = true;
    user.isBlocked = false;
    await user.save();
    return user;
  }

  /**
   * 5. Toggle User Status
   */
  async toggleUserStatus(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid user ID format");
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(id);
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    user.isActive = !user.isActive;
    user.isBlocked = !user.isActive;
    await user.save();
    return user;
  }

  /**
   * 6. Delete User
   */
  async deleteUser(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid user ID format");
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    return true;
  }
}

const adminService = new AdminService();
export default adminService;
export { AdminService, adminService };
