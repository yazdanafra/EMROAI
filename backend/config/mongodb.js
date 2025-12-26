// config/mongodb.js
import mongoose from "mongoose";

const DEFAULT_URI = "mongodb://127.0.0.1:27017/ophix";

const connectDB = async () => {
  const uri = process.env.MONGODB_URI?.trim() || DEFAULT_URI;
  console.log("Using MongoDB URI:", uri);

  try {
    // Mongoose v6+ doesn't need useNewUrlParser / useUnifiedTopology options,
    // but you can keep timeouts for clearer failures.
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    console.log(`✅ Database Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error("❌ Database connection error:", error);
    // don't immediately exit in production if you want to attempt reconnects;
    // for now we throw so caller can decide what to do.
    throw error;
  }
};

export default connectDB;
