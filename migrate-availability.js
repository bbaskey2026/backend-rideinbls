// check-vehicles.js
import mongoose from 'mongoose';
import Vehicle from './models/Vehicle.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkVehicles() {
  try {
    const mongoURI = process.env.MONGO_URI || process.env.DATABASE_URL;
    await mongoose.connect(mongoURI);
    
    const vehicles = await Vehicle.find({});
    console.log('\nCurrent Vehicle Status:\n');
    
    vehicles.forEach(v => {
      console.log(`${v.name} (${v.licensePlate})`);
      console.log(`  isAvailable: ${v.isAvailable}`);
      console.log(`  available: ${v.available}`);
      console.log('---');
    });
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkVehicles();