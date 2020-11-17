const rolesCommand = require('./roles_command');

module.exports = class RequestQueue {
  constructor(server) {
    this.server = server;
    this.isProcessing = false;
    this.queue = [];
  }

  async processNext() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }
    this.isProcessing = true;
    const args = this.queue.shift();

    try {
      await rolesCommand.execute(this.server, args);
    } catch(error) {
      console.error(`[${args.user.username}] ${error.name}: ${error.message}`);
    } finally {
      this.processNext();
    }
  }

  enqueue(request) {
    this.queue.push(request);
    if (!this.isProcessing) {
      this.processNext();
      return 0;
    } else {
      return this.queue.length;
    }
  }
};
