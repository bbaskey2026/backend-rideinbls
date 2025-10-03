import mongoose from "mongoose";

const fieldSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // 'text', 'number', 'date', 'image'
  value: { type: mongoose.Schema.Types.Mixed } // can be string, number, date, or Buffer object
});

const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  fields: { type: [fieldSchema], required: true }
}, { timestamps: true });

export default mongoose.model("Post", postSchema);
