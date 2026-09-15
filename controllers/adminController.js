import BookingPayment from "../models/BookingPayment.js";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";

// 1. Get Payment Analytics & Financial KPIs
export const getPaymentAnalytics = async (req, res, next) => {
  try {
    const bookings = await BookingPayment.find().populate("user", "name email mobile");

    let totalRevenue = 0;
    let totalRefunds = 0;
    let refundedCount = 0;
    const statusMap = {};
    const dateMap = {};

    bookings.forEach((b) => {
      const amt = Number(b.totalPrice || b.payment?.amount || 0);
      const isRefund = b.paymentStatus === "Refunded" || b.refund?.isRefunded;

      if (b.paymentStatus === "Paid" || b.payment?.status === "paid") {
        totalRevenue += amt;
      }

      if (isRefund) {
        const refAmt = Number(b.refund?.refundAmount || amt);
        totalRefunds += refAmt;
        refundedCount += 1;
      }

      const s = (b.paymentStatus || b.payment?.status || "pending").toLowerCase();
      statusMap[s] = (statusMap[s] || 0) + 1;

      const dateStr = b.createdAt ? new Date(b.createdAt).toISOString().split("T")[0] : "Today";
      dateMap[dateStr] = (dateMap[dateStr] || 0) + amt;
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

    return res.status(200).json({
      success: true,
      data: bookings,
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
    });
  } catch (error) {
    next(error);
  }
};

// 2. Get All Users
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Block User
export const blockUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isActive = false;
    user.isBlocked = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "User account suspended successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// 4. Unblock User
export const unblockUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isActive = true;
    user.isBlocked = false;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "User account restored successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// 5. Toggle User Status
export const toggleUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isActive = !user.isActive;
    user.isBlocked = !user.isActive;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User status changed to ${user.isActive ? "Active" : "Suspended"}`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// 6. Delete User
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Aliases
export const getDashboardStats = getPaymentAnalytics;

