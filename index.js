const puppeteer = require('puppeteer');
const Discord = require('discord.js');
const client = new Discord.Client();

const LANGUAGES = [null,
  "english", "german", "french", "portugese", "spanish", "indonesian", "turkish", "vietnamese", "polish", "romanian", "malaysian",
  "norwegian", "persian", "hungarian", "chinese_traditional", "chinese_simplified", "danish", "dutch", "swedish", "italian",
  "finnish", "serbian", "catalan", "filipino", "croatian", "russian", "arabic", "bulgarian", "japanese", "albanian", "korean",
  "greek", "czech", "estonian", "latvian", "hebrew", "urdu", "galician", "lithuanian", "georgian", "armenian", "kurdish", "azerbaijani",
  "hindi", "slovak", "slovenian", null, "icelandic", null, "thai", "pashto", "esperanto", "ukrainian", "macedonian", "malagasy", "bengali",
];

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`)
  const browser = await puppeteer.launch();

  client.on('message', async (message) => {
    const args = message.content.split(' ');
    const command = args.shift();
    if (command !== '!test' || args.length !== 2) return;

    const [profileUrl, language] = args;
    const langId = LANGUAGES.indexOf(language);
    const userId = profileUrl.match(/(\d+)\/?$/)[1];

    const page = await browser.newPage();
    await page.goto(profileUrl);

    await page.waitForSelector('#graph-fullscreen');
    await page.click('#graph-fullscreen');
    const langBtnSelector = `#graph-flag-selection-fullscreen a[speedtest_id='${langId}']`;
    await page.waitForSelector(langBtnSelector);

    page.on('response', async (e) => {
      const url = e.request().url();
      if (url !== `https://10fastfingers.com/users/get_graph_data/1/${userId}/${langId}`) return;
      const body = await e.json();
      const maxNormWpm = parseInt(body.max_norm);
      const maxAdvWpm = parseInt(body.max_adv);

      // Code goes here
      console.log(maxNormWpm, maxAdvWpm);

      await page.close();
    });

    await page.waitForTimeout(500);
    await page.click(langBtnSelector);
  });
});

client.login(process.env['DISCORD_BOT_TOKEN']);
