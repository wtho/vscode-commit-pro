module.exports = {
  register: (server, options, next) => {
    return {
      compile: (file, done) => {
        console.log('ts-node.js: mock.compile called');
        throw new Error('ts-node.js: mock.compile is not implemented yet!');
      }
    }
  }
}
