const Discord = require('discord.js');
const client = new Discord.Client();

const RequestQueue = require('./src/request_queue');

const config = require('./data/config.json');
const languages = require('./data/languages.json');
const colors = require('./data/colors.json');

let server;
let enabled = true;
let queue;

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  server = await client.guilds.fetch(config.guildId);
  queue = new RequestQueue(server);
});

client.on('message', async (message) => {
  let user = message.author;

  if (message.channel.type === 'dm' && [config.wradionId, ...Object.values(config.moderators)].includes(user.id)) {
    if (message.content === 'disable') {
      enabled = false;
      message.channel.send('Bot is now disabled.');
      return;
    } else if (message.content === 'enable') {
      enabled = true;
      message.channel.send('Bot is now enabled.');
      return;
    }
  }
  else if (process.env.NODE_ENV !== 'production' || message.channel.id !== config.roleRequestChannelId) return;

  // Get Command name and Args
  const args = message.content.split(' ');
  const command = args.shift();

  // Command `role`
  if (command !== '!roles' && command !== '!rolesdebug') return;
  console.debug(`User ${user.username} issued command \`${message}\``);

  if (!enabled) {
    console.log('Bot is disabled.');
    return;
  }

  // Set DEBUG flag
  if (command === '!rolesdebug') process.env.DEBUG = true;

  // Init command
  let url, language, norm, adv;
  let overrideUser = null;

  // Automatic params assignment
  for (const arg of args) {
    if (arg.match(/https:\/\/10fastfingers\.com\/user\/\d+\/?/)) {
      url = arg;
    } else if (arg.match(/^[a-zA-Z_]+$/)) {
      language = arg.toLowerCase();
    } else if (arg.match(/^\d{1,3}$/)) {
      if (!norm) norm = parseInt(arg);
      else if (!adv) adv = parseInt(arg);
      else { /* Error */ }
    } else if (arg.match(/^\d{10,}$/) && process.env.DEBUG) {
      overrideUser = (await server.members.fetch(arg)).user;
    } else {
      // Error
    }
  }

  // Params validation
  let reason = null;
  while (true) {
    if (!url) { reason = "Invalid or missing 10FF Profile URL"; break; }
    if (language && !languages.includes(language)) { reason = `Language \`${language}\` doesn't exist or is not supported`; break; }
    if (0 > norm || norm >= 250) { reason = 'Normal WPM should be between 0 and 250'; break; }
    if (0 > adv || adv >= 220) { reason = 'Advanced WPM should be between 0 and 220'; break; }
    break;
  };

  // Create DM channel if needed
  let dm = user.dmChannel;
  if (!dm) dm = await (await server.members.fetch(user.id)).createDM();
  async function send(msg) { return await dm.send(msg); }

  // Display error and return if any
  if (reason) {
    await send({
      embed: {
        color: colors.error,
        description: `:x: **Error:** ${reason}!`
      }
    });
    await message.react('❌');
    return;
  }

  // Add command to queue
  const request = {
    requesterId: user.id,
    userId: overrideUser ? overrideUser.id : user.id,
    messageId: message.id,
    isDm: message.channel.type === 'dm',
    url: url,
    language: language,
    norm: norm,
    adv: adv
  };

  queue.enqueue(request, async position => {
    await send({
      embed: {
        color: colors.info,
        description: `:information_source: Your request has been registered. You're in position **#${position}** in the queue.`
      }
    });
  });
});

client.login(process.env['DISCORD_BOT_TOKEN']);
