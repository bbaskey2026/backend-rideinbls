import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  productName: String,
  amount: Number,
  orderId: String,
  paymentId: String,
  status: { type: String, default: "created" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Order", orderSchema);
