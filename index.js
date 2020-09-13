const puppeteer = require('puppeteer');
const Discord = require('discord.js');
const client = new Discord.Client();

const GUILD_ID = '362145917933060097';

const LANGUAGES = [null,
  "english", "german", "french", "portugese", "spanish", "indonesian", "turkish", "vietnamese", "polish", "romanian", "malaysian",
  "norwegian", "persian", "hungarian", "chinese_traditional", "chinese_simplified", "danish", "dutch", "swedish", "italian",
  "finnish", "serbian", "catalan", "filipino", "croatian", "russian", "arabic", "bulgarian", "japanese", "albanian", "korean",
  "greek", "czech", "estonian", "latvian", "hebrew", "urdu", "galician", "lithuanian", "georgian", "armenian", "kurdish", "azerbaijani",
  "hindi", "slovak", "slovenian", null, "icelandic", null, "thai", "pashto", "esperanto", "ukrainian", "macedonian", "malagasy", "bengali",
];

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`)
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });

  const normRoles = [];
  const advRoles = [];

  const guild = await client.guilds.fetch(GUILD_ID);
  for (let [key, value] of guild.roles.cache) {
    const roleName = value.name;

    const normMatch = roleName.match(/^(\d+).(\d+) WPM$/i);
    if (normMatch) {
      normRoles[Math.round(parseInt(normMatch[1])/10)] = value;
    }
    const advMatch = roleName.match(/^(\d+).(\d+) WPM \(Advanced\)$/i);
    if (advMatch) {
      advRoles[Math.round(parseInt(advMatch[1])/10)] = value;
    }
  }

  const acceptedUsers = {};

  client.on('message', async (message) => {
    if (message.channel.type === 'dm' && message.author.name === 'wRadion' && message.content === 'ping') {
      message.channel.send('Pong!');
      return;
    }

    if (message.channel.type !== 'dm' && message.channel.id !== '392327059881328650') return;

    const authorId = message.author.id;
    const member = await guild.members.fetch(authorId);

    if (message.channel.type === 'dm' && acceptedUsers[authorId]) {
      const botMessage = await message.channel.send('Please wait...');

      // Check and Add role to user
      const [maxNorm, maxAdv] = acceptedUsers[authorId];
      const [norm, adv] = message.content.split(' ').map(i => Math.round(Number(i)/10));
      const normRole = normRoles[norm];
      const advRole = advRoles[adv];

      const normValid = maxNorm > 0 && norm <= maxNorm;
      const advValid = maxAdv > 0 && adv <= maxAdv;

      if (!normValid || !advValid) {
        let msg = '';
        if (!normValid) msg +=`You cannot have the **${normRole.name}** role as your detected max normal WPM is **${maxNorm} WPM**.`;
        if (!advValid) {
          if (msg.length > 0) msg += '\n';
          msg += `You cannot have the **${advRole.name}** role as your detected max advanced WPM is **${maxAdv} WPM**.`;
        }
        botMessage.edit(msg);
        return;
      }

      let msg = '';
      const roleManager = member.roles;
      // Remove All current + add Normal Role
      for (let role of Object.values(normRoles)) {
        if (roleManager.cache.find((k, v) => v === role.id)) roleManager.remove(role);
      }
      await roleManager.add(normRole, `By Bot, Max WPM is ${maxNorm}.`);
      msg += `You were given the role **${normRole.name}** role successfully.`;

      // Remove All current + add Advanced Role
      for (let role of Object.values(advRoles)) {
        if (roleManager.cache.find((k, v) => v === role.id)) roleManager.remove(role);
      }
      await roleManager.add(advRole, `By Bot, Max Advanced WPM is ${maxAdv}.`);
      msg += `\nYou were given the role **${advRole.name}** role successfully.`;

      botMessage.edit(msg);
      return;
    }

    const args = message.content.split(' ');
    const command = args.shift();
    if (command !== 'role') return
    if (args.length !== 2) {
      await message.channel.send('Wrong number of arguments. Usage:\n```role <your 10ff profile url> <language>```');
      return;
    }

    const botMessage = await message.channel.send('Please wait...');

    const [profileUrl, language] = args;
    const langId = LANGUAGES.indexOf(language);

    if (langId < 0) {
      botMessage.edit(`Error: Language \`${language}\` doesn't exist.`);
      return;
    }

    const userId = profileUrl.match(/(\d+)\/?$/)[1];

    try
    {
      const page = await browser.newPage();
      await page.goto(profileUrl);

      await page.waitForSelector('#graph-fullscreen');
      await page.click('#graph-fullscreen');
      const langBtnSelector = `#graph-flag-selection-fullscreen a[speedtest_id='${langId}']`;
      await page.waitForSelector(langBtnSelector);

      page.on('response', async (e) => {
        try
        {
          const url = e.request().url();
          if (url !== `https://10fastfingers.com/users/get_graph_data/1/${userId}/${langId}`) return;
          const body = await e.json();
          let maxNormWpm = parseInt(body.max_norm);
          const maxAdvWpm = parseInt(body.max_adv);

          // Fetch competitions
          const competWpms = [];
          const rows = await page.$$('#recent-competitions tr');
          for (let i = 1; i < rows.length; ++i) {
            const competLangId = await rows[i].$eval('span.flag', node => parseInt(node['id'].substring(6)));
            if (competLangId !== langId) continue;
            const link = await rows[i].$eval('a', node => node['href']);
            const competScoreSelector = `tr[user_id='${userId}'] .wpm`;
            const competPage = await browser.newPage();

            try
            {
              // Fetch single competition wpm
              await competPage.goto(link);
              await competPage.waitForSelector(competScoreSelector);
              const competWpm = await competPage.$eval(competScoreSelector, node => parseInt(node.innerText));
              competWpms.push(competWpm);
            }
            catch (e)
            {
              botMessage.edit('An error has occured while trying to fetch your competitions scores.\n' +
                'Please try again later.\n' +
                'Error:\n```' + e + '```'
              );
            }
            finally
            {
              await competPage.close();
            }
          }

          // Code goes here
          maxNormWpm = Math.max(maxNormWpm, ...competWpms);
          botMessage.edit(`__**User Id:**__ \`#${userId}\`\n` +
            `__**Language:**__ \`${language}\`\n` +
            `__**Max Norm/Adv:**__ \`${maxNormWpm} WPM\` / \`${maxAdvWpm} WPM\`\n\n`);
          acceptedUsers[authorId] = [maxNormWpm, maxAdvWpm];
          message.author.dmChannel.send(`You can choose your desired roles here for normal and advanced by typing 2 numbers. Example:\n` +
            `Type \`120 90\` to have the **120-129 WPM** and **90~99 WPM (Advanced)** role.`);
        }
        catch (e)
        {
          botMessage.edit('An error has occured while trying to fetch your graph data.\n' +
            'Please try again later.\n' +
            'Error:\n```' + e + '```'
          );
        }
        finally
        {
          await page.close();
        }
      });

      await page.waitForTimeout(500);
      await page.click(langBtnSelector);
    }
    catch (e)
    {
      botMessage.edit('An error has occured while trying to fetch your user profile.\n' +
        'Please check that your profile is accessible and try again.\n' +
        'Error:\n```' + e + '```'
      );
    }
  });
});

client.login(process.env['DISCORD_BOT_TOKEN']);
