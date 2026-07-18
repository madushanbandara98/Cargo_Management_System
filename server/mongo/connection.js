import mongoose from 'mongoose';

let connectionPromise;

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is required. Add it to your .env file.');
  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
    throw new Error('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string.');
  }

  mongoose.set('strictQuery', true);
  connectionPromise = mongoose.connect(uri, {
    ...(process.env.MONGODB_DB?.trim() ? { dbName: process.env.MONGODB_DB.trim() } : {}),
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    maxPoolSize: 10
  }).then(() => mongoose.connection).catch(error => {
    connectionPromise = undefined;
    throw error;
  });
  return connectionPromise;
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}
