module.exports = class Page {
  constructor(page, logFunction) {
    this.page = page;
    this.page.setDefaultTimeout(10000);
    this.logFunction = logFunction;
  }

  close() {
    return this.page.close();
  }

  goto(url) {
    this.logFunction(`Going to \`${url}\`...`);
    return this.page.goto(url);
  }

  wait(time) {
    this.logFunction(`Waiting \`${time} ms\`...`);
    return this.page.waitForTimeout(time);
  }

  waitForSelector(selector) {
    this.logFunction(`Waiting for element \`${selector}\`...`);
    return this.page.waitForSelector(selector);
  }

  async click(selector, wait = true) {
    this.logFunction(`Waiting and clicking on element \`${selector}\`...`);
    if (wait) await this.page.waitForSelector(selector);
    return this.page.click(selector);
  }

  async $(selector, callback = n => n) {
    this.logFunction(`Waiting and fetching element \`${selector}\`...`);
    await this.page.waitForSelector(selector);
    return await this.page.$eval(selector, callback);
  }

  async $$(selector, callback = n => n) {
    this.logFunction(`Waiting and querying all selector \`${selector}\`...`);
    await this.page.waitForSelector(selector);
    return await this.page.$$(selector, callback);
  }

  on(event, callback) {
    this.page.on(event, callback);
  }

  clearListeners() {
    this.page.removeAllListeners();
  }
};
