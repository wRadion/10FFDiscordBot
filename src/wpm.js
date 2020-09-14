const Browser = require('../lib/browser');

module.exports = {
  fetchMaxNormAdv: async function(url, langId, logFonction, callback) {
    const userId = url.match(/(\d+)\/?$/)[1];

    const browser = new Browser(logFonction);
    await browser.launch();
    const page = await browser.newPage();
    await page.goto(url);
    await page.click('#graph-fullscreen');

    if (langId <= 0) langId = parseInt(await page.$('span.flag.active', n => n['id'].substring(6)));

    page.on('response', async (res) => {
      if (res.request().url() !== `https://10fastfingers.com/users/get_graph_data/1/${userId}/${langId}`) return;

      // Fetch Max Norm/Adv score (last 400 tests)
      const {max_norm, max_adv} = await res.json();
      const [maxNorm, maxAdv] = [max_norm, max_adv].map(Number);

      // Fetch Max Competition score
      let maxCompetWpm = 0;

      const rows = await page.$$('#recent-competitions tr');
      for (let i = 1; i < rows.length; ++i) {
        if (parseInt((await rows[i].$eval('span.flag', n => n['id'])).substring(6)) !== langId) continue;

        const competPage = await browser.newPage();
        await competPage.goto(await rows[i].$eval('a', n => n['href']));
        const competWpm = parseInt(await competPage.$(`tr[user_id='${userId}'] .wpm`, n => n.innerText));
        if (competWpm > maxCompetWpm) maxCompetWpm = competWpm;
      }

      // Close browser and call callback
      await browser.close();
      callback(langId, Math.max(maxNorm, maxCompetWpm), maxAdv);
    });

    await page.wait(500);
    await page.click(`#graph-flag-selection-fullscreen a[speedtest_id='${langId}']`);
  }
};
