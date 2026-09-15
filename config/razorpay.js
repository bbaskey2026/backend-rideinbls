import Razorpay from "razorpay";
import dotenv from "dotenv";

dotenv.config();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder_key";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "placeholder_secret";

let razorpayInstance = null;

export const getRazorpayInstance = () => {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.warn(
        "⚠️ RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set in environment variables. Using placeholder keys for initialization."
      );
    }

    try {
      razorpayInstance = new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET,
      });
    } catch (err) {
      console.error("❌ Failed to initialize Razorpay client:", err.message);
    }
  }
  return razorpayInstance;
};

export const razorpay = getRazorpayInstance();

export default razorpay;
