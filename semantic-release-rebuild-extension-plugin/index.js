const { exec } = require('child_process');

module.exports = {
  async prepare() {
    const command = `npm run vscode:package -w extension`;
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(stderr);
        }
        resolve(stdout);
      });
    })
  }
}
