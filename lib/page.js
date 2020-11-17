module.exports = class Page {
  constructor(page) {
    this.page = page;
    this.page.setDefaultTimeout(10000);
    this.logFunction = console.log;
  }

  setLogFunction(logFunction) {
    this.logFunction = logFunction;
  }

  async goto(url) {
    this.logFunction(`Going to \`${url}\`...`);
    await this.page.goto(url);
  }

  async wait(time) {
    this.logFunction(`Waiting \`${time} ms\`...`);
    await this.page.waitForTimeout(time);
  }

  async waitForSelector(selector) {
    this.logFunction(`Waiting for element \`${selector}\`...`);
    await this.page.waitForSelector(selector);
  }

  async click(selector, wait = true) {
    this.logFunction(`Waiting and clicking on element \`${selector}\`...`);
    if (wait) await this.page.waitForSelector(selector);
    await this.page.click(selector);
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
};
