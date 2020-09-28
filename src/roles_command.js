const rolesUpdater = require('./roles_updater');

const config = require('../data/config.json');
const languages = require('../data/languages.json');
const colors = require('../data/colors.json');

module.exports = {
  execute: async function(server, { requesterId, userId, messageId, isDm, url, language, norm, adv }, callback) {
    const startTime = Date.now();
    const requester = (await server.members.fetch(requesterId)).user;
    const member = await server.members.fetch(userId);
    const user = member.user;
    const dm = requester.dmChannel;

    // Get original message
    let message;
    if (isDm) message = await dm.messages.fetch(messageId);
    else {
      let channel = await server.channels.resolve(config.roleRequestChannelId);
      message = await channel.messages.fetch(messageId);
    }

    async function send(msg) {
      try {
        return await dm.send(msg);
      } catch {
        await message.react('🇮');
        await message.react('🇨');
        await message.react('🇦');
        await message.react('🇳');
        await message.react('🇹');
        await message.react('🇩');
        await message.react('🇲');
        await message.react('🇾');
        await message.react('🇴');
        await message.react('🇺');
        return null;
      }
    }

    // Command execution
    let botMessage = await send({
      embed: {
        color: colors.waiting,
        description: `:hourglass: **Processing your request. Please wait...**`
      }
    });

    // Get language id
    const langId = language ? languages.indexOf(language) : -1;

    // Setup log function
    function logFunction(msg) { console.log(`[${requester.username}] ${msg}`); }
    logFunction('Processing request...');

    // Get roles (ids) to add/remove
    await rolesUpdater.getRolesToUpdate(user, member, url, langId, norm, adv, logFunction,
      // callback Error
      async error => {
        logFunction(`Error: ${error}`);
        if (botMessage) {
          await botMessage.edit({
            embed: {
              color: colors.error,
              description: `:x: **Error:** ${error}\n\n` +
                `Please read https://github.com/wRadion/10FFDiscordBot for more help.`
            }
          });
        }
        logFunction(`Done (${(Date.now() - startTime)/1000} sec)`);
        await message.react('❌');
        callback();
      },
      // callback Warn
      async (maxNorm, maxAdv, wpmRoles, removedVerified) => {
        for (let id of Object.values(config.moderators)) {
          const moderatorMember = await server.members.fetch(id);
          const moderatorUser = moderatorMember.user;

          let dm = moderatorUser.dmChannel;
          if (!dm) dm = await moderatorMember.createDM();
          dm.send(
            (process.env.DEBUG ? '**This is a DEBUG message, please ignore it**\n\n' : '') +
            `:warning: Heads up, **${moderatorUser.username}**!\n\n` +
            `User **${user.tag}** (__${member.nickname || user.username}__) updated his WPM roles.\n` +
            `Here is the 10FF profile link he provided: ${url}\n` +
            `His max detected WPMs are **${maxNorm} WPM** and **${maxAdv} WPM (Advanced)**.\n` +
            `The following 200WPM+ roles were added:\n` +
            wpmRoles.map(r => `- **${r}**\n`).join('\n') +
            (removedVerified ? `:negative_squared_cross_mark: His **Verified** role has been removed.` : `:question: He didn't have the **Verified** role.`)
          );
        }
      },
      // callback Ok
      async (roles) => {
        const addedRoles = [];
        const removedRoles = [];

        // Add roles to add
        for (let id of roles.toAdd) {
          const role = await server.roles.fetch(id);
          addedRoles.push(role.name);
          if (!process.env.DEBUG && process.env.NODE_ENV === "production") {
            member.roles.add(id, `Added by Roles Request Bot`).then(() => {
              logFunction(`Role '${role.name}' was given to ${user.tag}`);
            });
          }
        }

        // Remove roles to remove
        for (let id of roles.toRemove) {
          const role = await server.roles.fetch(id);
          removedRoles.push(role.name);
          if (!process.env.DEBUG && process.env.NODE_ENV === "production") {
            member.roles.remove(id, `Removed by Roles Request Bot`).then(() => {
              logFunction(`Role '${role.name}' was removed from ${user.tag}`);
            });
          }
        }

        if (addedRoles.length > 0 || removedRoles.length > 0) {
          // If there are roles added/removed
          if (botMessage) {
            await botMessage.edit({
              embed: {
                color: colors.success,
                description:
                  `:white_check_mark: **Success!**\n\n` +
                  (addedRoles.length > 0 ? `The following roles were __added__:\n${addedRoles.map(r => `- **${r}**`).join('\n')}\n\n` : '') +
                  (removedRoles.length > 0 ? `The following roles were __removed__:\n${removedRoles.map(r => `- **${r}**`).join('\n')}` : '')
              }
            });
          }
        } else {
          // Else if there are no roles to add/remove
          if (botMessage) {
            await botMessage.edit({
              embed: {
                color: colors.info,
                description: ":information_source: Your roles are up to date! _(No roles to add or remove)_"
              }
            });
          }
        }

        logFunction(`Done (${(Date.now() - startTime)/1000} sec)`);
        message.react('✅');

        callback();
      }
    );
  }
};
