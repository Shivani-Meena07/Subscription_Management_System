
import mongoose from 'mongoose';

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing. Set it in backend/.env.');
  }

  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });

    console.log(`MongoDB Connected: ${connection.connection.host}`);
    return connection;
  } catch (error) {
    const reason = error.code || error.name || 'connection error';
    throw new Error(
      `MongoDB connection failed (${reason}). Verify MongoDB is running and MONGODB_URI in backend/.env points to a reachable database.`,
      { cause: error }
    );
  }
};

export default connectDB;
