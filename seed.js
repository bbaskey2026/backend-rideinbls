import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import User from "./models/User.js";
import Vehicle from "./models/Vehicle.js";
import Driver from "./models/Driver.js";
import { twentyVehicles } from "./seed_20_vehicles.js";

dotenv.config();

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {}

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://bhimadev26_db_user:jsL6yYJ1f6QBxHvY@67.osprb3a.mongodb.net/rideinbls?retryWrites=true&w=majority&appName=67";

const sampleDrivers = [
  {
    name: "Ramesh Kumar Mohanty",
    email: "ramesh.driver@rideinbls.com",
    mobile: "9876543210",
    dateOfBirth: new Date("1988-04-12"),
    licenseNumber: "OD01-2015-0098712",
    licenseType: "Commercial",
    licenseExpiry: new Date("2030-04-12"),
    licenseIssueDate: new Date("2015-04-12"),
    yearsOfExperience: 9,
    rating: 4.9,
    status: "Active",
  },
  {
    name: "Subhashis Nayak",
    email: "subhashis.driver@rideinbls.com",
    mobile: "9876543211",
    dateOfBirth: new Date("1992-08-25"),
    licenseNumber: "OD01-2018-0045671",
    licenseType: "Commercial",
    licenseExpiry: new Date("2032-08-25"),
    licenseIssueDate: new Date("2018-08-25"),
    yearsOfExperience: 6,
    rating: 4.8,
    status: "Active",
  },
];

const seedDatabase = async () => {
  try {
    console.log("Connecting to database at:", MONGO_URI.replace(/:([^@]+)@/, ":****@"));
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log("✅ Connected to MongoDB successfully\n");

    // 1. Seed Admin & Demo Users
    console.log("Seeding Users...");
    await User.deleteMany({ email: { $in: ["admin@rideinbls.com", "demo@rideinbls.com"] } });

    await User.create({
      name: "Administrator",
      email: "admin@rideinbls.com",
      password: "Admin@123456",
      mobile: 9876500001,
      role: "admin",
      isActive: true,
    });

    await User.create({
      name: "John Doe",
      email: "demo@rideinbls.com",
      password: "User@123456",
      mobile: 9876500002,
      role: "user",
      isActive: true,
    });
    console.log(` ✅ Created Admin user: admin@rideinbls.com`);
    console.log(` ✅ Created Demo user: demo@rideinbls.com`);

    // 2. Seed 20 Fleet Vehicles
    console.log("\nSeeding 20 Fleet Vehicles...");
    await Vehicle.deleteMany({});
    const createdVehicles = await Vehicle.insertMany(twentyVehicles);
    console.log(` ✅ Seeded ${createdVehicles.length} vehicles across Sedans, SUVs, Luxury & EVs.`);

    // 3. Seed Drivers
    console.log("\nSeeding Drivers...");
    await Driver.deleteMany({ email: { $in: sampleDrivers.map((d) => d.email) } });
    if (createdVehicles[0]) {
      sampleDrivers[0].assignedVehicle = createdVehicles[0]._id;
    }
    const createdDrivers = await Driver.insertMany(sampleDrivers);
    console.log(` ✅ Seeded ${createdDrivers.length} verified drivers.`);

    console.log("\n=======================================================");
    console.log("🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!");
    console.log("=======================================================");
    console.log("🔑 Default Login Credentials:");
    console.log("   Admin Email: admin@rideinbls.com");
    console.log("   Admin Pass:  Admin@123456");
    console.log("   User Email:  demo@rideinbls.com");
    console.log("   User Pass:   User@123456");
    console.log("=======================================================\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  }
};

seedDatabase();
