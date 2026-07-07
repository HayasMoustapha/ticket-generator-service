const path = require('path');
const posixPath = (value) => value.replace(/\\/g, '/');

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  setupFiles: [posixPath(path.join(__dirname, 'tests/setup/jest.env.setup.js'))],
  testTimeout: 30000,
  verbose: true,
};
