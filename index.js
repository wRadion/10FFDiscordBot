const Discord = require('discord.js');
const client = new Discord.Client();

let server;
let enabled = true;

const rolesUpdater = require('./src/roles_updater');
const config = require('./data/config.json');
const languages = require('./data/languages.json');
const colors = require('./data/colors.json');

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  server = await client.guilds.fetch(config.guildId);
});

client.on('message', async (message) => {
  const startTime = Date.now();
  let user = message.author;

  if (message.channel.type === 'dm' && user.id === config.wradionId) {
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
  else if (message.channel.id !== config.roleRequestChannelId) return;

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
    if (arg.match(/https:\/\/10fastfingers.com\/user\/\d+\/?/)) {
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
    if (language && !languages.includes(language)) { reason = `Language \`${language}\` doesn't exist`; break; }
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
    return;
  }

  // Use overriden user (when !rolesdebug)
  if (overrideUser) user = overrideUser;
  const member = await server.members.fetch(user.id);

  // Command execution
  let botMessage = await send({
    embed: {
      color: colors.waiting,
      description: `:hourglass: **Please wait...**`
    }
  });
  const langId = language ? languages.indexOf(language) : -1;

  function logFunction(msg) { console.log(`[${user.username}] ${msg}`); }

  await rolesUpdater.getRolesToUpdate(user, member, url, langId, norm, adv, logFunction,
    async error => await botMessage.edit({
      embed: {
        color: colors.error,
        description: `:x: **Error:** ${error}`
      }
    }),
    async (maxNorm, maxAdv, wpmRoles, removedVerified) => {
      for (let id of Object.values(config.moderators)) {
        id = config.wradionId;
        const moderatorMember = await server.members.fetch(id);
        const moderatorUser = moderatorMember.user;

        let dm = moderatorUser.dmChannel;
        if (!dm) dm = await moderatorMember.createDM();
        dm.send(
          `:warning: Headsup, **${moderatorUser.username}**!\n\n` +
          `User **${user.tag}** (__${member.nickname || user.username}__) updated his WPM roles.\n` +
          `Here is the 10FF profile link he provided: ${url}\n` +
          `His max detected WPMs are **${maxNorm} WPM** and **${maxAdv} WPM (Advanced)**.\n` +
          `The following 200WPM+ roles were added:\n` +
          wpmRoles.map(r => `- **${r}**\n`).join('\n') +
          (removedVerified ? `:negative_squared_cross_mark: His **Verified** role has been removed.` : `:question: He didn't have the **Verified** role.`)
        );
      }
    }, async (roles) => {
      const addedRoles = [];
      const removedRoles = [];

      for (let id of roles.toAdd) {
        const role = await server.roles.fetch(id);
        addedRoles.push(role.name);
        if (!process.env.DEBUG) await member.roles.add(role, `Added by ${client.user.tag}`);
      }

      for (let id of roles.toRemove) {
        const role = await server.roles.fetch(id);
        removedRoles.push(role.name);
        if (!process.env.DEBUG) await member.roles.remove(role, `Removed by ${client.user.tag}`);
      }

      if (addedRoles.length > 0 || removedRoles.length > 0) {
        await botMessage.edit({
          embed: {
            color: colors.success,
            description:
              `:white_check_mark: **Success!**\n\n` +
              (addedRoles.length > 0 ? `The following roles were __added__:\n${addedRoles.map(r => `- **${r}**`).join('\n')}\n\n` : '') +
              (removedRoles.length > 0 ? `The following roles were __removed__:\n${removedRoles.map(r => `- **${r}**`).join('\n')}` : '')
          }
        });
      } else {
        await botMessage.edit({
          embed: {
            color: colors.info,
            description: ":information_source: Your roles are up to date! _(No roles to add or remove)_"
          }
        });
      }

      logFunction(`Done (${(Date.now() - startTime)/1000} sec)`);
    }
  );
});

client.login(process.env['DISCORD_BOT_TOKEN']);
