import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/rideinbls";
console.log(`Checking MongoDB connection at: ${uri}`);

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
  console.log("✅ Successfully connected to MongoDB!");

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log(`\nFound ${collections.length} collections:`);

  for (const col of collections) {
    const count = await mongoose.connection.db.collection(col.name).countDocuments();
    console.log(` - ${col.name}: ${count} document(s)`);
    if (count > 0) {
      const sample = await mongoose.connection.db.collection(col.name).find().limit(2).toArray();
      console.log(`   Sample from ${col.name}:`, JSON.stringify(sample, null, 2));
    }
  }

  await mongoose.disconnect();
} catch (err) {
  console.log("❌ MongoDB connection result:", err.message);
}
process.exit(0);
