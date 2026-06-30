/**
 * jest.config.js
 * 
 * Configures Jest for testing ES Modules correctly in a Node environment.
 */
export default {
  testEnvironment: 'node',
  transform: {}, // No transforms needed for standard ESM on recent Node versions
  // Ensure Jest ignores the frontend code if ever run globally
  modulePathIgnorePatterns: ['<rootDir>/../client/'],
  // Auto-setup file to mock the MongoDB instance 
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  verbose: true,
  testTimeout: 30000,
};
