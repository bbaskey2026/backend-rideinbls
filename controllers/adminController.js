import * as adminService from "../services/adminService.js";

// 1. Get Payment Analytics & Financial KPIs
export const getPaymentAnalytics = async (req, res, next) => {
  try {
    const result = await adminService.getPaymentAnalytics();
    return res.status(200).json({
      success: true,
      data: result.bookings,
      metrics: result.metrics,
      analytics: result.analytics,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Get All Users
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await adminService.getAllUsers();
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
    const user = await adminService.blockUser(req.params.id);
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
    const user = await adminService.unblockUser(req.params.id);
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
    const user = await adminService.toggleUserStatus(req.params.id);
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
    await adminService.deleteUser(req.params.id);
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
