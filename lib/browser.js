const puppeteer = require('puppeteer');
const Page = require('./page');

module.exports = class Browser {
  constructor(logFunction) {
    this.logFunction = logFunction;
    this.pages = [];
  }

  async launch() {
    this.logFunction('Launching browser...');
    this.browser = await puppeteer.launch(
      {
        args: [
          '--aggressive-cache-discard',
          '--disable-cache',
          '--disable-application-cache',
          '--disable-offline-load-stale-cache',
          '--disable-gpu-shader-disk-cache',
          '--disk-cache-size=0',
          '--media-cache-size=0',
          '--no-sandbox'
        ]
      }
    );
  }

  async newPage() {
    this.logFunction('Opening new page...');
    const page = new Page(await this.browser.newPage(), this.logFunction);
    this.pages.push(page);
    return page;
  }

  async close() {
    this.logFunction('Closing browser...');
    this.pages.forEach(async page => await page.close());
    await this.browser.close();
  }
};
