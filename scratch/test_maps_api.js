import axios from "axios";

const API_KEY = "AIzaSyDpvowX1Wyib9ZPM75h1uSBy5Cbscn25nc";

const testGoogleMapsAPI = async () => {
  console.log("==================================================");
  console.log("🔍 TESTING GOOGLE MAPS API KEY VALIDITY");
  console.log("Key:", API_KEY.slice(0, 10) + "..." + API_KEY.slice(-5));
  console.log("==================================================\n");

  // 1. Test Places Autocomplete
  try {
    console.log("1. Testing Places Autocomplete API...");
    const res = await axios.get("https://maps.googleapis.com/maps/api/place/autocomplete/json", {
      params: {
        input: "Balasore",
        key: API_KEY,
        types: "(cities)",
        language: "en",
        components: "country:in",
      },
      timeout: 8000,
    });

    console.log("   Status:", res.data.status);
    if (res.data.status === "OK") {
      console.log("   ✅ Places Autocomplete: WORKING PERFECTLY!");
      console.log(`   Found ${res.data.predictions?.length} predictions (e.g. "${res.data.predictions[0]?.description}")`);
    } else {
      console.log("   ⚠️ Places Autocomplete Response:", res.data.status, "-", res.data.error_message || "No error message");
    }
  } catch (err) {
    console.log("   ❌ Places Autocomplete Error:", err.response?.data || err.message);
  }

  // 2. Test Distance Matrix API
  try {
    console.log("\n2. Testing Distance Matrix API...");
    const res = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
      params: {
        origins: "Balasore, Odisha",
        destinations: "Bhubaneswar, Odisha",
        key: API_KEY,
        units: "metric",
      },
      timeout: 8000,
    });

    console.log("   Status:", res.data.status);
    if (res.data.status === "OK") {
      const element = res.data.rows?.[0]?.elements?.[0];
      if (element?.status === "OK") {
        console.log("   ✅ Distance Matrix: WORKING PERFECTLY!");
        console.log(`   Route: Balasore -> Bhubaneswar (${element.distance.text}, ${element.duration.text})`);
      } else {
        console.log("   ⚠️ Distance Matrix element status:", element?.status);
      }
    } else {
      console.log("   ⚠️ Distance Matrix Response:", res.data.status, "-", res.data.error_message || "No error message");
    }
  } catch (err) {
    console.log("   ❌ Distance Matrix Error:", err.response?.data || err.message);
  }

  // 3. Test Geocoding API
  try {
    console.log("\n3. Testing Geocoding API...");
    const res = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: {
        address: "Balasore, Odisha",
        key: API_KEY,
      },
      timeout: 8000,
    });

    console.log("   Status:", res.data.status);
    if (res.data.status === "OK") {
      console.log("   ✅ Geocoding API: WORKING PERFECTLY!");
      console.log("   Formatted Address:", res.data.results?.[0]?.formatted_address);
      console.log("   Coordinates:", res.data.results?.[0]?.geometry?.location);
    } else {
      console.log("   ⚠️ Geocoding Response:", res.data.status, "-", res.data.error_message || "No error message");
    }
  } catch (err) {
    console.log("   ❌ Geocoding Error:", err.response?.data || err.message);
  }

  console.log("\n==================================================");
  console.log("Test finished.");
  console.log("==================================================");
  process.exit(0);
};

testGoogleMapsAPI();
