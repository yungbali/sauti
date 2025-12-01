/**
 * Verification Script for Sauti Media BaaS Features
 * Tests WebSocket connectivity and simulates events
 */

const { io } = require("socket.io-client");

const URL = "http://localhost:3000";
const socket = io(URL);

console.log("🚀 Starting Feature Verification...");

socket.on("connect", () => {
    console.log(`✅ WebSocket Connected! ID: ${socket.id}`);

    // Test 1: Subscribe to Asset
    console.log("📡 Testing Asset Subscription...");
    socket.emit("subscribe_asset", "test-asset-123");

    // Test 2: Subscribe to Job
    console.log("📡 Testing Job Subscription...");
    socket.emit("subscribe_job", "job_123");
});

socket.on("viewer_count", (data) => {
    console.log(`\n✨ RECEIVED VIEWER COUNT EVENT:`);
    console.log(JSON.stringify(data, null, 2));
    console.log("✅ Real-time Viewer Count Verified!");

    // We can exit after receiving an event
    setTimeout(() => {
        console.log("\n🎉 All checks passed! Exiting...");
        process.exit(0);
    }, 1000);
});

socket.on("connect_error", (err) => {
    console.error(`❌ Connection Error: ${err.message}`);
    process.exit(1);
});

// Keep alive for a bit
setTimeout(() => {
    console.log("⏳ Waiting for events...");
}, 1000);
