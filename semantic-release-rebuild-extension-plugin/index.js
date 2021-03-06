const { exec } = require('child_process');

module.exports = {
  async prepare(pluginConfig, context) {
    const command = `npm run vscode:package -w extension`;
    const options = { cwd: context.cwd }
    return new Promise((resolve, reject) => {
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject(stderr);
          return
        }
        resolve(stdout);
      });
    })
  }
}
