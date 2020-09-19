const rolesCommand = require('./roles_command');

module.exports = class RequestQueue {
  constructor(server) {
    this.server = server;
    this.isProcessing = false;
    this.queue = [];
  }

  processNext() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }
    this.isProcessing = true;
    rolesCommand.execute(this.server, this.queue.shift(), () => this.processNext());
  }

  enqueue(request, callback) {
    this.queue.push(request);
    if (!this.isProcessing) this.processNext();
    else callback(this.queue.length);
  }
};
