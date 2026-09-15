import axios from "axios";

const testEndpoints = async () => {
  console.log("Testing POST /api/google/distance...");
  try {
    const res = await axios.post("http://localhost:5000/api/google/distance", {
      source: "Balasore, Odisha",
      destination: "Bhubaneswar, Odisha",
    });
    console.log("✅ Distance API Success:", res.data);
  } catch (err) {
    console.log("❌ Distance API Error:", err.response?.data || err.message);
  }

  console.log("\nTesting POST /api/auth/register...");
  try {
    const res = await axios.post("http://localhost:5000/api/auth/register", {
      name: "Test Rider",
      email: "test.rider" + Date.now() + "@example.com",
      mobile: "9876543210",
      password: "Password@123",
    });
    console.log("✅ Register API Success:", res.data);
  } catch (err) {
    console.log("❌ Register API Error:", err.response?.data || err.message);
  }
};

testEndpoints();
