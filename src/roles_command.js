const rolesUpdater = require('./roles_updater');

const config = require('../data/config.json');
const colors = require('../data/colors.json');

module.exports = {
  async execute(server, { user, member, message, dm, url, langId, norm, adv, compUrl }) {
    const startTime = Date.now();

      // Send main message
      let botMessage;
      try {
        logFunction('Sending processing DM...');
        botMessage = await dm.send({
          embeds: [{
            color: colors.waiting,
            description: `:hourglass: **Processing your request. Please wait...**`
          }]
        });
      } catch (e) {
        // User can't recieve DMs
        botMessage = null;
        console.debug(`[${user.username}] ${e.name}: ${e.message}`);
        try {
          await message.react('💬');
        } catch {
          // A reaction is optional feedback when DMs are unavailable.
        }
      }

      async function editMessage(msg) {
        if (!botMessage) {
          logFunction('Skipping DM edit: processing DM is unavailable.');
          return;
        }
        logFunction('Editing response DM...');
        await botMessage.edit(msg);
        logFunction('Response DM updated.');
      }

      // Setup log function
      function logFunction(msg) { console.log(`[${user.username}] ${msg}`); }
      logFunction('Processing request...');

    try {
      // Get roles (ids) to add/remove
      const roles = await rolesUpdater.getRolesToUpdate(user, member, url, langId, norm, adv, compUrl, logFunction,
        // callback Warn
        async (maxNorm, maxAdv, wpmRoles, removedVerified, removedVerifiedAdv) => {
          for (let id of Object.values(config.moderators)) {
            logFunction(`Fetching moderator ${id}...`);
            const moderatorMember = await server.members.fetch(id);
            const moderatorUser = moderatorMember.user;

            logFunction(`Creating DM channel for moderator ${id}...`);
            const modDm = await moderatorUser.createDM();
            logFunction(`Sending moderator notification to ${id}...`);
            await modDm.send(
              (process.env.DEBUG ? '**This is a DEBUG message, please ignore it**\n\n' : '') +
              `:warning: Heads up, **${moderatorUser.username}**!\n\n` +
              `User **${user.tag}** (__${member.nickname || user.username}__) updated his WPM roles.\n` +
              `Here is the 10FF profile link he provided: ${url}\n` +
              `His max detected WPMs are **${maxNorm} WPM** and **${maxAdv} WPM (Advanced)**.\n` +
              `The following 200WPM+ roles were added:\n` +
              wpmRoles.map(r => `- **${r}**\n`).join('\n') +
              (removedVerified ? `:negative_squared_cross_mark: His **Verified** role has been removed.` : `:question: He didn't have the **Verified** role.`) +
              (removedVerifiedAdv ? `:negative_squared_cross_mark: His **Verified (Advanced)** role has been removed.` : `:question: He didn't have the **Verified (Advanced)** role.`)
            );
            logFunction(`Moderator ${id} notified.`);
          }
        }
      );
      const addedRoles = [];
      const removedRoles = [];

        // Add roles to add
      for (const id of roles.toAdd) {
        logFunction(`Fetching role ${id} to add...`);
        const role = await server.roles.fetch(id);
        addedRoles.push(role.name);
        if (process.env.NODE_ENV === "production") {
          logFunction(`Adding role '${role.name}' (${id})...`);
          await member.roles.add(id, `Added by Auto-Roles Bot`);
          logFunction(`Role '${role.name}' was given to ${user.tag}`);
        }
      }

        // Remove roles to remove
      for (const id of roles.toRemove) {
        logFunction(`Fetching role ${id} to remove...`);
        const role = await server.roles.fetch(id);
        removedRoles.push(role.name);
        if (process.env.NODE_ENV === "production") {
          logFunction(`Removing role '${role.name}' (${id})...`);
          await member.roles.remove(id, `Removed by Auto-Roles Bot`);
          logFunction(`Role '${role.name}' was removed from ${user.tag}`);
        }
      }

      if (addedRoles.length > 0 || removedRoles.length > 0) {
          // If there are roles added/removed
        await editMessage({
          embeds: [{
              color: colors.success,
              description:
                `:white_check_mark: **Success!**\n\n` +
                (addedRoles.length > 0 ? `The following roles were __added__:\n${addedRoles.map(r => `- **${r}**`).join('\n')}\n\n` : '') +
                (removedRoles.length > 0 ? `The following roles were __removed__:\n${removedRoles.map(r => `- **${r}**`).join('\n')}` : '')
          }]
        });
      } else {
          // Else if there are no roles to add/remove
        await editMessage({
          embeds: [{
              color: colors.info,
              description: ":information_source: Your roles are up to date! _(No roles to add or remove)_"
          }]
        });
      }

      logFunction(`Done (${(Date.now() - startTime)/1000} sec)`);
      logFunction('Adding success reaction...');
      await message.react('✅');
    } catch (error) {
        // callback Error
        logFunction(`Error: ${error}`);
        logFunction(`Error details: status=${error?.response?.status ?? error?.status ?? 'unknown'}, code=${error?.code ?? 'unknown'}`);

        let error_cut = null;
        let emoji = null;
        const split = (error instanceof Error ? error.message : String(error)).split(';;');
        error_cut = split[0];
        if (split.length > 1) emoji = split[1];

        if (emoji === "👤") {
          logFunction('Sending profile ownership error to the command channel...');
          await message.channel.send(
              `👤 :x: ${member}: Please copy this: \`${member.user.tag}\` or this \`${member.user.id}\` in your **10FF profile description** so I can verify that this 10FF profile is yours.`
          );
        } else if (emoji === "0⃣") {
          logFunction('Sending missing tests error to the command channel...');
          await message.channel.send(
              `0⃣ :x: ${member}: You have to do **at least one test** to have a WPM role (competitions don't count).`
          );
        }

      await editMessage({
        embeds: [{
            color: colors.error,
            description: `:x: **Error:** ${error_cut}\n\n` +
              `Please read https://github.com/wRadion/10FFDiscordBot for more help or contact **@wRadion** if this issue persist.`
        }]
      });

        logFunction(`Done (${(Date.now() - startTime)/1000} sec)`);
        if (emoji) {
          try {
            logFunction(`Adding error hint reaction: ${emoji}`);
            await message.react(emoji);
          } catch {
            // A reaction is optional feedback.
          }
        }
        try {
          logFunction('Adding failure reaction...');
          await message.react('❌');
        } catch {
          // A reaction is optional feedback.
        }
    }
  },
};
