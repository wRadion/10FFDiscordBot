const Discord = require('discord.js');
const client = new Discord.Client();

const RequestQueue = require('./src/request_queue');

const config = require('./data/config.json');
const languages = require('./data/languages.json');
const colors = require('./data/colors.json');

let server;
let queue;
let autoRolesChannel;

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Fetch Guild
  server = await client.guilds.fetch(config.guildId);

  // Fetch #auto-roles Channel
  autoRolesChannel = server.channels.resolve(config.channels.autoRoles);

  // Initialize RequestQueue
  queue = new RequestQueue(server);

  console.log('Bot is Ready!');
});

client.on('message', async (message) => {
  let user = message.author;

  // If it's this bot, just skip
  if (user.id === client.user.id) return;

  if (message.channel.type === 'dm' && [config.users.wradion, ...Object.values(config.moderators)].includes(user.id)) {
    if (message.content === 'disable') {
      console.debug('Disabling the bot...');
      await autoRolesChannel.send({
        embed: {
          color: colors.warning,
          description: '⚠ Bot is now disabled due to maintenance.'
        }
      });
      await autoRolesChannel.updateOverwrite(server.roles.everyone, { SEND_MESSAGES: false });
      console.debug('Bot disabled.');
      return;
    } else if (message.content === 'enable') {
      console.debug('Enabling the bot...');
      await autoRolesChannel.updateOverwrite(server.roles.everyone, { SEND_MESSAGES: null });
      await autoRolesChannel.send({
        embed: {
          color: colors.success,
          description: ':white_check_mark: Bot is now enabled!'
        }
      });
      console.debug('Bot enabled!');
      return;
    }
    if (process.env.NODE_ENV === 'production') return;
  }
  else if (process.env.NODE_ENV !== 'production' || (message.channel.id !== config.channels.autoRoles && message.channel.id !== config.channels.rolesRequest)) {
    return;
  }

  // Get Command name and Args
  const args = message.content.split(/\s+/);
  const command = args.shift();

  // Create DM channel if needed
  let dm = user.dmChannel;
  let member = await server.members.fetch(user.id);

  try {
    if (!dm) dm = await member.createDM();
  } catch (e) {
    console.debug(`[${user.username}] Could not create DM channel - ${e.name}: ${e.message}`);
  }

  async function send(msg) {
    try {
      return await dm.send(msg);
    } catch (e) {
      // User can't recieve DMs
      console.debug(`[${user.username}] ${e.name}: ${e.message}`);
      await message.react('💬');
    }
  }

  // Command `!roles`
  if (command !== '!roles') {
    if (message.channel.id === config.channels.autoRoles) {
      // Command is not !roles, channel is right channel
      if (user.id !== client.user.id && user.id !== config.users.wradion) {
        // Command is not !roles, channel is right channel, user is not bot or wRadion
        await send({
          embed: {
            color: colors.error,
            description: `:no_entry: You can only use the \`!roles\` command inside the ${autoRolesChannel} channel.`
          }
        });
        await message.delete();
        return;
      } else {
        // Command is not !roles, channel is right channel, user is bot or wRadion
        return;
      }
    } else {
      // Command is not !roles, channel is wrong channel
      return;
    }
  } else if (message.channel.id === config.channels.rolesRequest) {
    // Command is !roles, channel is rolesRequest channel
    await send({
      embed: {
        color: colors.error,
        description: `:no_entry: You must use the \`!roles\` command inside the ${autoRolesChannel} channel.`
      }
    });
    await message.delete();
    return;
  }

  console.debug(`User ${user.username} issued command \`${message}\``);

  // Ignore consty, for good
  if (user.id === config.users.consty)
  {
    await message.delete();
    return;
  }

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
    if (message.channel.type !== 'dm') await message.delete();
    return;
  }

  // Add command to queue
  queue.enqueue({
    user: user,
    member: member,
    message: message,
    dm: dm,
    url: url,
    language: language,
    norm: norm,
    adv: adv
  }, async position => {
    await send({
      embed: {
        color: colors.info,
        description: `:information_source: Your request has been registered. You're in position **#${position}** in the queue.`
      }
    });
  });
});

client.login(process.env.DISCORD_BOT_TOKEN);
