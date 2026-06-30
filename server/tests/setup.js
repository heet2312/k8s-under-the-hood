/**
 * tests/setup.js
 * 
 * Global test setup hook for Jest.
 * Spins up an in-memory MongoDB instance so we don't connect to 
 * our real local dev database during `npm run test`.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Ensure the real logger is silent during test runs to avoid pollution
import logger from '../src/utils/logger.js';
logger.transports.forEach((t) => (t.silent = true));

let mongoServer;

beforeAll(async () => {
  // Disconnect from any lingering real mongoose connections 
  await mongoose.disconnect();
  
  // Start the memory server and connect 
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  
  await mongoose.connect(uri, { bufferCommands: false });
});

afterEach(async () => {
  // Clear all data between individual tests
  const collections = mongoose.connection.collections;
  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  // Close everything down cleanly after all tests finish
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});
