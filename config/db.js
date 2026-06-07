const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// seedUsers — runs once after DB connects.
// Creates Player1 + Player2 if the users collection is empty, then prints
// all seeded users and their _id values to the terminal.
// ---------------------------------------------------------------------------
const seedUsers = async () => {
  // Lazy-require to avoid circular dependency issues at module load time
  const User = require('../models/User');

  const count = await User.countDocuments();

  if (count === 0) {
    console.log('🌱 No users found — seeding default players...');
    await User.insertMany([
      { username: 'Player1' },
      { username: 'Player2' },
    ]);
    console.log('✅ Seed complete.');
  }

  // Always print all users so the dev has valid IDs to hand-copy into the frontend
  const users = await User.find({}).select('username _id').lean();
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 Registered Users (copy these IDs into the frontend)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  users.forEach((u) => {
    console.log(`   ${u.username.padEnd(12)} → _id: ${u._id}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
};

// ---------------------------------------------------------------------------
// connectDB — establishes the Mongoose connection then seeds if needed.
// ---------------------------------------------------------------------------
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    await seedUsers();
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
