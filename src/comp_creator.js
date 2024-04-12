require('dotenv').config();

const puppeteer = require('puppeteer');

const languages = require('../data/languages.json');

module.exports = {
    createComp: async (lang) => {
        return new Promise(async (resolve, reject) => {
            const langId = languages.findIndex(l => l !== null && l.name === lang);

            if (langId < 0) {
                return null;
            }

            const browser = await puppeteer.launch();
            const page = await browser.newPage();

            await page.goto('https://10fastfingers.com/login');

            // Login
            // - cookie banner
            let selector = '#CybotCookiebotDialogBodyButtonDecline';
            try {
                await page.waitForSelector(selector);
                await page.click(selector);
            await new Promise(resolve => setTimeout(resolve, 1000));
            } catch {}

            await page.$eval('#UserEmail', (el, value) => el.value = value, process.env.BOT_ACCOUNT_EMAIL);
            await page.$eval('#UserPassword', (el, value) => el.value = value, process.env.BOT_ACCOUNT_PASSWORD);

            selector = '#login-form-submit';
            await page.focus(selector);
            await page.click(selector);
            await new Promise(resolve => setTimeout(resolve, 5000));

            await page.goto('https://10fastfingers.com/competitions');

            // Create Competition
            // - go to create game tab
            selector = '#main-content > ul > li:nth-child(3) > a';
            await page.waitForSelector(selector);
            await page.click(selector);
            await page.screenshot({path: 'test1.png'});
            await new Promise(resolve => setTimeout(resolve, 1000));

            // - check private
            selector = '#create-competition-content > label';
            await page.waitForSelector(selector);
            await page.click(selector);
            await page.screenshot({path: 'test2.png'});

            // - click on the language
            selector = `#speedtestid${langId}`;
            await page.waitForSelector(selector);
            await page.click(selector);
            await page.screenshot({path: 'test3.png'});

            // - create comp
            selector = '#link-create-competition';
            await page.waitForSelector(selector);
            await page.focus(selector);
            await page.screenshot({path: 'test45.png'});
            await page.click(selector);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await page.screenshot({path: 'test4.png'});

            selector = '#share-link > a';
            await page.waitForSelector(selector);
            await page.screenshot({path: 'test5.png'});

            const compUrl = await page.$eval('#share-link > a', el => el.textContent);
            console.log(compUrl);

            await browser.close();
        });
    }
};
