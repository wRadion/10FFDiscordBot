const fs = require('fs');
const Browser = require('../lib/browser');

const roles = require('../data/roles.json');

async function getUserInfos(user, url, langId, logFunction, callbackError, callbackOk) {
  const userInfos = {};

  // Get userId from 10FF profile URL
  const userId = url.match(/(\d+)\/?$/)[1];

  // Launch Browser and create new Page
  const browser = new Browser(logFunction);
  await browser.launch();
  const page = await browser.newPage();
  await page.goto(url);

  // Accept Cookies
  try {
    await page.click('#CybotCookiebotDialogBodyLevelButtonAcceptWrapper');
  } catch {}

  // Get 10FF username and description
  const description = await page.$('#profile-description', n => n.innerText);

  // Check if the profile is owned by the user
  if (!process.env.DEBUG && !description.match(user.tag) && !description.match(user.id)) {
    await browser.close();
    callbackError(
      `Couldn't verify your identity. Please write your Discord tag (**${user.tag}**) OR your Discord ID (**${user.id}**) in your 10FF profile **description** and retry.`,
      '👤');
    return;
  }

  // Click the Fullscreen button (top-right of the graph)
  await page.click('#graph-fullscreen');
  await page.waitForSelector('#graph-flag-selection-fullscreen');

  // Get the main language if langId is not given
  if (langId < 0) langId = parseInt(await page.$('span.flag.active', n => n['id'].substring(6)));
  userInfos.langId = langId;

  // Specific roles
  userInfos.supporter = !(await page.$('#supporter-100', n => n.className.split(' '))).includes('locked');
  userInfos.translator = !(await page.$('#special-translator', n => n.className.split(' '))).includes('locked');
  userInfos.completionist = true;
  const achievements = await page.$$('.achievement:not(.special):not(.hidden)');
  for (let e of achievements) {
    if ((await e.evaluate(h => h.className)).includes('locked')) {
      userInfos.completionist = false;
      break;
    }
  }

  // Tests and Competitions Taken
  const dataTable = await page.$$('#profile-data-table tr td');
  userInfos.testsTaken = parseInt(await dataTable[13].evaluate(h => h.innerText.split(',').join('')));
  userInfos.competsTaken = parseInt(await dataTable[15].evaluate(h => h.innerText.split(',').join('')));

  // Listen for the API response to get the max norm/adv WPM
  page.on('response', async (res) => {
    if (res.request().url() !== `https://10fastfingers.com/users/get_graph_data/1/${userId}/${langId}`) return;

    // Get Max Norm/Adv score (last 400 tests)
    const data = await res.json();
    let [maxNorm, maxAdv] = [data.max_norm, data.max_adv].map(Number);

    // Chinese traditional/simplified
    if (langId === 15 || langId === 16) {
      maxNorm = Math.max(...data.graph_data.filter(s => !!s.g1).map(s => parseInt(s.correct_words)));
      maxAdv = Math.max(...data.graph_data.filter(s => !!s.g2).map(s => parseInt(s.correct_words)));
    } // Japanese
    else if (langId === 29) {
      const japaneseDate = new Date("2019-02-25 00:00:00");
      maxNorm = Math.max(...data.graph_data.filter(s => !!s.g1 && new Date(s.date) > japaneseDate).map(s => parseInt(s.g1)))
      maxAdv = Math.max(...data.graph_data.filter(s => !!s.g2 && new Date(s.date) > japaneseDate).map(s => parseInt(s.g2)))
    }

    // Check Multilingual
    userInfos.multilingual = data.languages_sorted.filter(a => parseInt(a['0'].anzahl) >= 50).length >= 10;

    // Get Max Competition score
    // TODO: Add the possibility to use a specific compet for the record
    /*
    let maxCompetWpm = 0;

    const rows = await page.$$('#recent-competitions tr');
    for (let i = 1; i < rows.length; ++i) {
      if (parseInt(await rows[i].$eval('span.flag', n => n['id'].substring(6))) !== langId) continue;

      const competPage = await browser.newPage();
      await competPage.goto(await rows[i].$eval('a', n => n['href']));
      const competWpm = parseInt(await competPage.$(`tr[user_id='${userId}'] .wpm`, n => n.innerText));
      if (competWpm > maxCompetWpm) maxCompetWpm = competWpm;
    }
    */

    // Set max WPMs user infos
    userInfos.maxNorm = maxNorm;
    userInfos.maxAdv = maxAdv;

    // Close browser and call callback
    await browser.close();
    callbackOk(userInfos);
  });

  // Click on the language flag (in the fullscreen graph)
  await page.click(`#graph-flag-selection-fullscreen a[speedtest_id='${langId}']`);
}

module.exports = {
  getRolesToUpdate: async function(user, member, url, langId, norm, adv, logFunction, callbackError, callbackWarn, callbackOk) {
    await getUserInfos(user, url, langId, logFunction, callbackError, (userInfos) => {
      const rolesToUpdate = {};
      rolesToUpdate.toAdd = [];
      rolesToUpdate.toRemove = [];

      // Set automatically max norm/adv if none was requested
      if (!norm) norm = userInfos.maxNorm;
      if (!adv) adv = userInfos.maxAdv;

      // Check requested norm/adv WPM with max scores
      if (norm > userInfos.maxNorm) {
        callbackError(`You can't have the **${norm}-${norm+9} WPM** role as your detected max normal WPM is **${userInfos.maxNorm} WPM**.`, '🚫');
        return;
      } else if (adv > userInfos.maxAdv) {
        callbackError(`You can't have the **${adv}-${adv+9} WPM (Advanced)** role as your detected max advanced WPM is **${userInfos.maxAdv} WPM**.`, '🚫');
        return;
      }

      // Get current roles
      const currentRoles = member.roles.cache.map(role => role.id);

      norm = Math.floor(norm / 10);
      adv = Math.floor(adv / 10);

      // Get new roles
      const oldRoles = [];
      const newRoles = [];

      // WPM roles
      newRoles.push(norm > 0 ? roles.norm[`${norm * 10}-${(norm * 10) + 9}`] : null);
      newRoles.push(adv > 0 ? roles.adv[`${adv * 10}-${(adv * 10) + 9}`] : null);
      const oldNormRoleIndex = Object.values(roles.norm).findIndex(role => currentRoles.includes(role));
      const oldAdvRoleIndex = Object.values(roles.adv).findIndex(role => currentRoles.includes(role));
      oldRoles.push(oldNormRoleIndex > -1 ? Object.values(roles.norm)[oldNormRoleIndex] : null);
      oldRoles.push(Object.values(roles.adv).find(role => currentRoles.includes(role)));

      // Remove Verified if new WPM > old WPM
      const oldNormWpm = oldNormRoleIndex > -1 ? parseInt(Object.keys(roles.norm)[oldNormRoleIndex].split('-')[0]) : 0;
      const oldAdvWpm = oldAdvRoleIndex > -1 ? parseInt(Object.keys(roles.adv)[oldAdvRoleIndex].split('-')[0]) : 0;
      const removeVerified = currentRoles.includes(roles.verified) && ((norm * 10) > oldNormWpm || (adv * 10) > oldAdvWpm);
      if (removeVerified) rolesToUpdate.toRemove.push(roles.verified);

      // Tests/Compets Taken roles
      userInfos.testsTaken = userInfos.testsTaken > 10000 ? 10000 : Math.floor(userInfos.testsTaken / 2500) * 2500;
      userInfos.competsTaken = userInfos.competsTaken > 10000 ? 10000 : Math.floor(userInfos.competsTaken / 2500) * 2500;
      newRoles.push(roles.testsTaken[userInfos.testsTaken.toString()]);
      newRoles.push(roles.competsTaken[userInfos.competsTaken.toString()]);
      oldRoles.push(Object.values(roles.testsTaken).find(role => currentRoles.includes(role)));
      oldRoles.push(Object.values(roles.competsTaken).find(role => currentRoles.includes(role)));

      // Add old/new roles into rolesToUpdate
      for (let i = 0; i < oldRoles.length; ++i) {
        const newrole = newRoles[i];
        const oldrole = oldRoles[i];
        if (newrole !== oldrole) {
          if (newrole) rolesToUpdate.toAdd.push(newrole);
          if (oldrole) rolesToUpdate.toRemove.push(oldrole);
        }
      }

      // Warn moderators if new WPM > 200
      const wpmRoles = [];
      if (norm >= 20) {
        for (let role of rolesToUpdate.toAdd) {
          let wpmNormRoleIndex = Object.values(roles.norm).indexOf(role);
          if (wpmNormRoleIndex >= 0) wpmRoles.push(`${Object.keys(roles.norm)[wpmNormRoleIndex]} WPM`);
        }
      }
      if (adv >= 20) {
        for (let role of rolesToUpdate.toAdd) {
          let wpmAdvRoleIndex = Object.values(roles.adv).indexOf(role);
          if (wpmAdvRoleIndex >= 0) wpmRoles.push(`${Object.keys(roles.adv)[wpmAdvRoleIndex]} WPM (Advanced)`)
        }
      }
      if (wpmRoles.length > 0) callbackWarn(userInfos.maxNorm, userInfos.maxAdv, wpmRoles, removeVerified);

      // Specials Roles
      function specialRole(boolean, role) {
        if (boolean) {
          if (!currentRoles.includes(role)) rolesToUpdate.toAdd.push(role);
        } else if (currentRoles.includes(role)) rolesToUpdate.toRemove.push(role);
      }
      specialRole(userInfos.supporter, roles.supporter);
      specialRole(userInfos.translator, roles.translator);
      specialRole(userInfos.completionist, roles.completionist);
      specialRole(userInfos.multilingual, roles.multilingual);

      callbackOk(rolesToUpdate);
    });
  }
};
