import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  name: String,
  price: Number, // in INR
  image: String,
});

export default mongoose.model("Product", productSchema);
