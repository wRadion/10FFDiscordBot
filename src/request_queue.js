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
      await rolesCommand.execute(this.server, args, () => this.processNext());
    } catch (e) {
      console.error(`[${args.user.username}] ${e.name}: ${e.message}`)
      this.isProcessing = false;
    }
  }

  enqueue(request, callback) {
    this.queue.push(request);
    if (!this.isProcessing) this.processNext();
    else callback(this.queue.length);
  }
};
