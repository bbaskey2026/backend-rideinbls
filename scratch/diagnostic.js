import dns from "dns";
import mongoose from "mongoose";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Fix for Node.js SRV DNS lookup issues on Windows: set DNS to Google/Cloudflare
dns.setServers(["8.8.8.8", "1.1.1.1"]);

console.log("==========================================");
console.log("🧪 DIAGNOSTIC TEST: DB & GOOGLE AUTOCOMPLETE");
console.log("==========================================\n");

// 1. Test Mongo URI
const mongoUri = process.env.MONGO_URI;
console.log("1. Testing MongoDB connection to:", mongoUri ? mongoUri.replace(/:([^@]+)@/, ":****@") : "MISSING");

try {
  if (!mongoUri) throw new Error("MONGO_URI not in .env");
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log("   ✅ MongoDB: CONNECTED SUCCESSFULLY!");
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log(`   Collections found: ${collections.map((c) => c.name).join(", ") || "None (new database)"}`);
  await mongoose.disconnect();
} catch (err) {
  console.log("   ❌ MongoDB Connection Failed:", err.message);
}

// 2. Test Autocomplete
console.log("\n2. Testing Google Places Autocomplete API with 'puri'...");
const key = process.env.GOOGLE_MAPS_API_KEY || "AIzaSyDpvowX1Wyib9ZPM75h1uSBy5Cbscn25nc";
try {
  const res = await axios.get("https://maps.googleapis.com/maps/api/place/autocomplete/json", {
    params: {
      input: "puri",
      key,
      types: "(cities)",
      language: "en",
      components: "country:in",
    },
    timeout: 5000,
  });

  console.log("   Status:", res.data.status);
  console.log("   ✅ Predictions found:", res.data.predictions?.map((p) => p.description));
} catch (err) {
  console.log("   ❌ Autocomplete Failed:", err.message);
}

console.log("\n==========================================");
process.exit(0);
