const rolesUpdater = require('./roles_updater');

const config = require('../data/config.json');
const colors = require('../data/colors.json');

module.exports = {
  execute: function(server, { user, member, message, dm, url, langId, norm, adv, compUrl }) {
    return new Promise(async (resolve) => {
      const startTime = Date.now();

      // Send main message
      let botMessage;
      try {
        botMessage = await dm.send({
          embed: {
            color: colors.waiting,
            description: `:hourglass: **Processing your request. Please wait...**`
          }
        });
      } catch (e) {
        // User can't recieve DMs
        botMessage = null;
        console.debug(`[${user.username}] ${e.name}: ${e.message}`);
        await message.react('💬');
      }

      async function editMessage(msg) {
        if (!botMessage) return;
        await botMessage.edit(msg);
      }

      // Setup log function
      function logFunction(msg) { console.log(`[${user.username}] ${msg}`); }
      logFunction('Processing request...');

      // Get roles (ids) to add/remove
      await rolesUpdater.getRolesToUpdate(user, member, url, langId, norm, adv, compUrl, logFunction,
        // callback Warn
        async (maxNorm, maxAdv, wpmRoles, removedVerified) => {
          for (let id of Object.values(config.moderators)) {
            const moderatorMember = await server.members.fetch(id);
            const moderatorUser = moderatorMember.user;

            let modDm = moderatorUser.dmChannel;
            if (!modDm) modDm = await moderatorMember.createDM();
            modDm.send(
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
        }
      ).then(async (roles) => {
        const addedRoles = [];
        const removedRoles = [];

        // Add roles to add
        for (let id of roles.toAdd) {
          const role = await server.roles.fetch(id);
          addedRoles.push(role.name);
          if (process.env.NODE_ENV === "production") {
            member.roles.add(id, `Added by Auto-Roles Bot`).then(() => {
              logFunction(`Role '${role.name}' was given to ${user.tag}`);
            });
          }
        }

        // Remove roles to remove
        for (let id of roles.toRemove) {
          const role = await server.roles.fetch(id);
          removedRoles.push(role.name);
          if (process.env.NODE_ENV === "production") {
            member.roles.remove(id, `Removed by Auto-Roles Bot`).then(() => {
              logFunction(`Role '${role.name}' was removed from ${user.tag}`);
            });
          }
        }

        if (addedRoles.length > 0 || removedRoles.length > 0) {
          // If there are roles added/removed
          await editMessage({
            embed: {
              color: colors.success,
              description:
                `:white_check_mark: **Success!**\n\n` +
                (addedRoles.length > 0 ? `The following roles were __added__:\n${addedRoles.map(r => `- **${r}**`).join('\n')}\n\n` : '') +
                (removedRoles.length > 0 ? `The following roles were __removed__:\n${removedRoles.map(r => `- **${r}**`).join('\n')}` : '')
            }
          });
        } else {
          // Else if there are no roles to add/remove
          await editMessage({
            embed: {
              color: colors.info,
              description: ":information_source: Your roles are up to date! _(No roles to add or remove)_"
            }
          });
        }

        logFunction(`Done (${(Date.now() - startTime)/1000} sec)`);
        message.react('✅');
        resolve();
      }).catch(async (error) => {
        // callback Error
        logFunction(`Error: ${error}`);

        let error_cut = null;
        let emoji = null;
        try {
          const split = error.split(';;');
          error_cut = split[0];
          if (split.length > 1) emoji = split[1];
        } catch {
          error_cut = error;
        }

        if (emoji === "👤") {
          await message.channel.send(
              `👤 :x: ${member}: Please copy your **Discord tag or ID** in your **10FF profile description** so I can verify that this 10FF profile is yours.`
          );
        } else if (emoji === "0⃣") {
          await message.channel.send(
              `0⃣ :x: ${member}: You have to do **at least one test** to have a WPM role (competitions don't count).`
          );
        }

        await editMessage({
          embed: {
            color: colors.error,
            description: `:x: **Error:** ${error_cut}\n\n` +
              `Please read https://github.com/wRadion/10FFDiscordBot for more help or contact **@wRadion** if this issue persist.`
          }
        });

        logFunction(`Done (${(Date.now() - startTime)/1000} sec)`);
        if (emoji) await message.react(emoji);
        await message.react('❌');
        resolve();
      });
    });
  }
};
