// Bind the port for Heroku
const app = require('express')();
app.get('/', (req, res) => { res.send('OK') })
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening port ${port}`))
// End

const Discord = require('discord.js');
const client = new Discord.Client();
let server;

let enabled = true;

const wpm = require('./src/wpm');
const data = require('./src/data');

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  server = await client.guilds.fetch(data.config.guildId);
});

client.on('message', async (message) => {
  const user = message.author;
  if (message.channel.type === 'dm' && user.id === data.config.wradionId) {
    if (message.content === 'disable') {
      enabled = false;
      message.channel.send('Bot is now disabled.');
    }
    else if (message.content === 'enable') {
      enabled = true;
      message.channel.send('Bot is now enabled.');
    }
    return;
  }
  else if (message.channel.id !== data.config.roleRequestChannelId) return;

  // Get Command name and Args
  const args = message.content.split(' ');
  const command = args.shift();

  // Command `role`
  if (command !== 'role') return;
  console.debug(`User ${user.username} issued command \`${message}\``);

  if (!enabled) {
    console.log('Bot is disabled.');
    return;
  }

  // Init command
  async function send(msg) { return await user.dmChannel.send(msg); }
  let url, language, norm, adv;

  // Automatic params assignment
  for (const arg of args) {
    if (arg.match(/https:\/\/10fastfingers.com\/user\/\d+\/?/)) {
      url = arg;
    } else if (arg.match(/^[a-zA-Z_]+$/)) {
      language = arg.toLowerCase();
    } else if (arg.match(/^\d+$/)) {
      if (!norm) norm = parseInt(arg);
      else if (!adv) adv = parseInt(arg);
      else { /* Error */ }
    } else {
      // Error
    }
  }

  // Params validation
  let reason = null;

  while (true) {
    if (!url) { reason = `Invalid 10FF Profile URL: \`${url}\`!`; break; }
    if (language && !data.languages.includes(language)) { reason = `Language \`${language}\` doesn't exist!`; break; }
    if (0 > norm || norm >= 250) { reason = 'Normal WPM should be between 0 and 250!'; break; }
    if (0 > adv || adv >= 220) { reason = 'Advanced WPM should be between 0 and 220!'; break; }
    break;
  };

  if (reason) {
    await send(
      `:x: **Error:** Invalid arguments for \`${command}\`:\n` +
      '\t\t' + reason + '\n\n' +
      `:small_blue_diamond: __Usage:__ \`role <profile url> <language> <normal wpm role> <advanced wpm role>\`\n\n` +
      `:small_blue_diamond: __Example:__ \`role https://10fastfingers.com/user/209050/ english 120 90\`\n` +
      `\t\tTo get the **120-129 WPM** role in _normal_, and **90~99 WPM (Advanced)** role in _advanced_.\n\n` +
      ':small_blue_diamond: __Tips:__\n' +
      `\t\tYou can omit the \`<language>\` if you wish to use your primary language (first flag in your profile graph)\n` +
      `\t\tYou can omit the \`<normal wpm role>\` and \`<advanced wpm role>\` if you wish me to detect automatically your highests scores.`
    );
    return;
  }

  // Command execution
  let botMessage = await send(':watch: Please wait...');
  const langId = language ? data.languages.indexOf(language) : 0;

  function editMsg(msg) {
    if (typeof(editMsg.count) === 'undefined') editMsg.count = 0;
    botMessage.edit(`:clock${editMsg.count + 1}: ${msg}`);
    editMsg.count = (editMsg.count + 1) % 12;
  }

  await wpm.fetchMaxNormAdv(url, langId, editMsg, async (newLangId, maxNorm, maxAdv) => {
    language = data.languages[newLangId];

    botMessage.edit(
      `:information_source: Your max detected WPM over your last 400 tests and 10 competitions in **${language}** is\n` +
      `Normal: \`${maxNorm} WPM\`, Advanced: \`${maxAdv} WPM\``
    );

    if (!norm) norm = maxNorm;
    if (!adv) adv = maxAdv;

    botMessage = await send(':watch: Please wait...');

    if (norm > maxNorm) {
      botMessage.edit(`:x: **Error:** You can't have the **${norm} WPM** role as your detected max normal WPM is **${maxNorm} WPM**.`);
      return;
    }
    if (adv > maxAdv) {
      botMessage.edit(`:x: **Error:** You can't have the **${adv} WPM** role as your detected max advanced WPM is **${maxAdv} WPM**.`);
      return;
    }

    norm = Math.floor(norm / 10);
    adv = Math.floor(adv / 10);

    let normRole, advRole;
    const member = await server.members.fetch(user.id);
    const rolesCache = member.roles.cache;

    // Update Normal roles
    const normRoles = data.roles.norm;
    for (let i = 0; i < normRoles.length; ++i) {
      const role = await server.roles.fetch(normRoles[i]);
      if (i === norm) {
        await member.roles.add(role, `Added By Bot, Max WPM is ${maxNorm}`);
        normRole = role;
      } else if (rolesCache.find((k, v) => v === role.id)) await member.roles.remove(role);
    }

    // Update Advanced roles
    const advRoles = data.roles.adv;
    for (let i = 0; i < advRoles.length; ++i) {
      const role = await server.roles.fetch(advRoles[i]);
      if (i === adv) {
        await member.roles.add(role, `Added By Bot, Max WPM is ${maxAdv}`);
        advRole = role;
      } else if (rolesCache.find((k, v) => v === role.id)) await member.roles.remove(role);
    }

    botMessage.edit(
      `:white_check_mark: Success! You were given the role **${normRole.name}** (normal) and **${advRole.name}** (advanced).\n` +
      'All your others WPM roles were removed.'
    );
  });
});

client.login(process.env['DISCORD_BOT_TOKEN']);
