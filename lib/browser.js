const puppeteer = require('puppeteer-extra');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
puppeteer.use(AdblockerPlugin());

const Page = require('./page');

const browserArgs = [
  '--aggressive-cache-discard',
  '--disable-cache',
  '--disable-application-cache',
  '--disable-offline-load-stale-cache',
  '--disable-gpu-shader-disk-cache',
  '--disk-cache-size=0',
  '--media-cache-size=0',
  '--no-sandbox'
];

var uniqueBrowser = null;
var uniquePage = null;

module.exports = {
  getPage: function(logFunction) {
    return new Promise((resolve) => {
      if (!uniqueBrowser) uniqueBrowser = await puppeteer.launch({ headless: process.env.NODE_ENV === 'production', args: browserArgs });
      if (!uniquePage) uniquePage = new Page(await uniqueBrowser.newPage());
      uniquePage.setLogFunction(logFunction);
      resolve(uniquePage);
    });
  }
};
