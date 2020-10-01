const Discord = require('discord.js');
const client = new Discord.Client();

const RequestQueue = require('./src/request_queue');

const config = require('./data/config.json');
const languages = require('./data/languages.json');
const colors = require('./data/colors.json');

let server;
let queue;
let channel;

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  server = await client.guilds.fetch(config.guildId);
  queue = new RequestQueue(server);
  channel = server.channels.resolve(config.channelId);
});

client.on('message', async (message) => {
  let user = message.author;

  if (message.channel.type === 'dm' && [config.wradionId, ...Object.values(config.moderators)].includes(user.id)) {
    if (message.content === 'disable') {
      console.debug('Disabling the bot...');
      await channel.send({
        embed: {
          color: colors.warning,
          description: '⚠ Bot is now disabled due to maintenance.'
        }
      });
      await channel.updateOverwrite(server.roles.everyone, { SEND_MESSAGES: false });
      return;
    } else if (message.content === 'enable') {
      console.debug('Enabling the bot...');
      await channel.updateOverwrite(server.roles.everyone, { SEND_MESSAGES: null });
      await channel.send({
        embed: {
          color: colors.success,
          description: ':white_check_mark: Bot is now enabled!'
        }
      });
      return;
    }
    if (process.env.NODE_ENV === 'production') return;
  }
  else if (process.env.NODE_ENV !== 'production' || (message.channel.id !== config.channelId && message.channel.id !== config.rolesRequestChannelId)) {
    return;
  }

  // Get Command name and Args
  const args = message.content.split(/\s+/);
  const command = args.shift();

  // Create DM channel if needed
  let dm = user.dmChannel;
  async function send(msg) {
    try {
      if (!dm) dm = await (await server.members.fetch(user.id)).createDM();
      return await dm.send(msg);
    } catch (e) {
      // User can't recieve DMs
      console.error(`[${user.username}] ${e.name}: ${e.message}`);
      await message.react('💬');
    }
  }

  // Command `!roles`
  if (command !== '!roles' &&  message.channel.id === config.channelId) {
    await send({
      embed: {
        color: colors.error,
        description: `:no_entry: You can only use the \`!roles\` command inside the ${channel} channel.`
      }
    });
    await message.delete();
    return;
  }

  // Wrong channel!
  if (message.channel.id === config.rolesRequestChannelId) {
    await send({
      embed: {
        color: colors.error,
        description: `:no_entry: You must use the \`!roles\` command inside the ${channel} channel.`
      }
    });
    await message.delete();
    return;
  }

  console.debug(`User ${user.username} issued command \`${message}\``);

  // Init command
  let url, language, norm, adv;
  let error = null;

  // Automatic params assignment
  for (const arg of args) {
    if (arg.match(/^https:\/\/10fastfingers\.com\/user\/\d+\/?$/)) {
      url = arg;
    } else if (arg.match(/^[a-zA-Z_]+$/)) {
      language = arg.toLowerCase();
    } else if (arg.match(/^\d{1,3}$/)) {
      if (!norm) norm = parseInt(arg);
      else if (!adv) adv = parseInt(arg);
      else error = `Unrecognized command argument: '${arg}'`;
    } else error = `Unrecognized command argument: '${arg}'`;
  }

  // Params validation
  while (!error) {
    if (!url) error = "Invalid or missing 10FF Profile URL";
    if (language && !languages.includes(language)) error = `Language \`${language}\` doesn't exist or is not supported`;
    if (0 > norm || norm >= 250) error = 'Normal WPM should be between 0 and 250';
    if (0 > adv || adv >= 220) error = 'Advanced WPM should be between 0 and 220';
    break;
  };

  // Display error and return if any
  if (error) {
    await send({
      embed: {
        color: colors.error,
        description: `:x: **Error:** ${error}.\n\n` +
          `Please read https://github.com/wRadion/10FFDiscordBot for more help.`
      }
    });
    await message.delete();
    return;
  }

  // Add command to queue
  const request = {
    userId: user.id,
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

client.login(process.env.DISCORD_BOT_TOKEN);
