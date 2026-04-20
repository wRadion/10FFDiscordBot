const axios = require('axios').default;
const cheerio = require('cheerio');
const moment = require('moment');

const ROLES = require('../data/roles.json');
const ACHIEVEMENTS = require('../data/achievements.json');
const LANGUAGES = require('../data/languages.json');

function getUserInfos(user, url, langId, compUrl, logFunction) {
  return new Promise(async (resolve, reject) => {
    const cleanUrl = url.endsWith('/') ? url.slice(0, url.length - 1) : url;
    const split = cleanUrl.split('/');

    const userInfos = {
      name: split.reverse()[0].toLowerCase(),
      langId: langId,
      langIso: langId > 0 ? LANGUAGES[langId].iso : (split.length > 5 ? split[3] : null)
    };

    // Fetch page HTML
    let response = await axios.get(url).catch(reject);
    if (!response) return;

    // Load HTML with cheerio
    const $ = cheerio.load(response.data);

    // Get 10FF profile description
    const description = $('p[data-testid="bio-text"]').text();

    // Check if the profile is owned by the user
    // The replace is there for escaping the chars used by regexp
    if (!description.match(user.tag.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&')) && !description.match(user.id)) {
      // Reject Promise
      reject(
        "Couldn't verify your identity." +
        ` Please write your Discord full tag (**${user.tag}**)` +
        ` OR your Discord ID (**${user.id}**) in your 10FF profile **description** and retry.;;👤`
      );
      return;
    }

    // Tests and Competitions Taken
    userInfos.testsTaken = parseInt($('dt[data-testid="text-label-tests-taken"] + dd').text().replaceAll('a', ''));
    userInfos.competsTaken = parseInt($('dt[data-testid="text-label-competitions"] + dd').text().split(' ')[0].replaceAll('a', ''));

    // Check if user has done at least one test
    if (userInfos.testsTaken <= 0) {
      // Reject Promise
      reject("You need to do at least one test on 10FF to have a WPM role (competitions are excluded).;;0⃣");
      return;
    }

    // Fetch WPMs
    const str = Array.from(response.data.matchAll(/\\\"id\\\":(\d+),\\\"username\\\":\\\"([^\\]+)\\\"/g));
    const ids = Object.fromEntries(str.map(res => [res[2].toLowerCase(), Number(res[1])]));

    logFunction("fetching wpms...");
    const data = await fetch(`https://api.10fastfingers.com/game-mode/typing-test-results/flat-stats/${ids[userInfos.name]}${userInfos.langIso ? '?languageIso=' + userInfos.langIso : ''}`);
    const wpms = (await data.json()).map(d => ({ wpm: d.wpm, mode: d.typingMode })).sort((a, b) => b.wpm - a.wpm);

    // Set max WPMs user infos
    userInfos.maxNorm = wpms.find(w => w.mode === 'normal').wpm;
    userInfos.maxAdv = wpms.find(w => w.mode === 'advanced').wpm;
    logFunction("wpms fetched");

    // Get competition wpm (if any is given)
    // if (compUrl) {
    //   // Get comp hash
    //   const hashId = compUrl.match(/([a-f0-9]+)\/?$/)[1];

    //   // Get language
    //   const { data: { Competition: compData } } = await axios.post(
    //     'https://10fastfingers.com/competition/view',
    //     `hash_id=${hashId}`,
    //     { headers: {
    //       'x-requested-with': 'XMLHttpRequest',
    //     } }
    //   ).catch(reject);

    //   // Check if language is good
    //   const compLangId = parseInt(compData.speedtest_id);

    //   if (compLangId !== userInfos.langId) {
    //     reject("The competition URL you provided is not in the right language.");
    //     return;
    //   }

    //   // Get competition result
    //   const { data: compResultPage } = await axios.post(
    //     'https://10fastfingers.com/competitions/get_competition_rankings',
    //     `hash_id=${hashId}`,
    //     { headers: {
    //       'x-requested-with': 'XMLHttpRequest',
    //     } }
    //   );

    //   // Load HTML and get user WPM
    //   const $comp = cheerio.load(compResultPage);
    //   const compWpm = parseInt($comp(`tr[user_id=${userInfos.id}] .wpm:first`).text());

    //   if (isNaN(compWpm)) {
    //     reject("You didn't participate in the competition you provided or an error occured while trying to get your WPM.");
    //     return;
    //   }

    //   if (userInfos.maxNorm < compWpm) {
    //     userInfos.maxNorm = compWpm;
    //     logFunction(`Competition WPM detected: ${userInfos.maxNorm}`);
    //   }
    // }

    // Check Multilingual (at least 50 tests in 10 languages)
    // userInfos.multilingual = data.languages_sorted.filter(a => parseInt(a['0'].anzahl) >= 50).length >= 10;

    // Year age member
    let dateStr = $('time[data-testid="DateTime-root"]').attr('datetime');
    if (dateStr && dateStr.length > 0) {
      const date = new Date(dateStr);
      logFunction(`Date detected: ${date}`);
      userInfos.ageInYears = moment().diff(date, 'years');
      logFunction(`Calculated: ${userInfos.ageInYears} years`);
      if (userInfos.ageInYears > 10) userInfos.ageInYears = 10;
    } else {
      userInfos.ageInYears = 0;
    }

    // Resolve Promise
    resolve(userInfos);
  });
}

module.exports = {
  getRolesToUpdate: function(user, member, url, langId, norm, adv, compUrl, logFunction, callbackWarn) {
    return getUserInfos(user, url, langId, compUrl, logFunction).then((userInfos) => {
      return new Promise(async (resolve, reject) => {
        const rolesToUpdate = {};
        rolesToUpdate.toAdd = [];
        rolesToUpdate.toRemove = [];

        // Set automatically max norm/adv if none was requested
        if (!norm) norm = userInfos.maxNorm;
        if (!adv) adv = userInfos.maxAdv;

        // Check requested norm/adv WPM with max scores
        if (norm > userInfos.maxNorm) {
          // Reject Promise
          reject(`You can't have the **${norm}-${norm+9} WPM** role as your detected max normal WPM is **${userInfos.maxNorm} WPM**.;;🚫`);
          return;
        } else if (adv > userInfos.maxAdv) {
          // Reject Promise
          reject(`You can't have the **${adv}-${adv+9} WPM (Advanced)** role as your detected max advanced WPM is **${userInfos.maxAdv} WPM**.;;🚫`);
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
        newRoles.push(norm > 0 ? ROLES.norm[`${norm * 10}-${(norm * 10) + 9}`] : null);
        newRoles.push(adv > 0 ? ROLES.adv[`${adv * 10}-${(adv * 10) + 9}`] : null);
        const oldNormRoleIndex = Object.values(ROLES.norm).findIndex(role => currentRoles.includes(role));
        const oldAdvRoleIndex = Object.values(ROLES.adv).findIndex(role => currentRoles.includes(role));
        oldRoles.push(oldNormRoleIndex > -1 ? Object.values(ROLES.norm)[oldNormRoleIndex] : null);
        oldRoles.push(Object.values(ROLES.adv).find(role => currentRoles.includes(role)));

        // Remove Verified if new WPM > old WPM
        const oldNormWpm = oldNormRoleIndex > -1 ? parseInt(Object.keys(ROLES.norm)[oldNormRoleIndex].split('-')[0]) : 0;
        const oldAdvWpm = oldAdvRoleIndex > -1 ? parseInt(Object.keys(ROLES.adv)[oldAdvRoleIndex].split('-')[0]) : 0;
        const removeVerified = currentRoles.includes(ROLES.verified) && ((norm * 10) > oldNormWpm);
        if (removeVerified) rolesToUpdate.toRemove.push(ROLES.verified);
        const removeVerifiedAdv = currentRoles.includes(ROLES.verifiedAdv) && ((adv * 10) > oldAdvWpm);
        if (removeVerifiedAdv) rolesToUpdate.toRemove.push(ROLES.verifiedAdv);

        // Tests/Compets Taken roles
        userInfos.testsTaken = userInfos.testsTaken > 10000 ? 10000 : Math.floor(userInfos.testsTaken / 2500) * 2500;
        userInfos.competsTaken = userInfos.competsTaken > 10000 ? 10000 : Math.floor(userInfos.competsTaken / 2500) * 2500;
        newRoles.push(ROLES.testsTaken[userInfos.testsTaken.toString()]);
        newRoles.push(ROLES.competsTaken[userInfos.competsTaken.toString()]);
        oldRoles.push(Object.values(ROLES.testsTaken).find(role => currentRoles.includes(role)));
        oldRoles.push(Object.values(ROLES.competsTaken).find(role => currentRoles.includes(role)));

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
            let wpmNormRoleIndex = Object.values(ROLES.norm).indexOf(role);
            if (wpmNormRoleIndex >= 0) wpmRoles.push(`${Object.keys(ROLES.norm)[wpmNormRoleIndex]} WPM`);
          }
        }
        if (adv >= 20) {
          for (let role of rolesToUpdate.toAdd) {
            let wpmAdvRoleIndex = Object.values(ROLES.adv).indexOf(role);
            if (wpmAdvRoleIndex >= 0) wpmRoles.push(`${Object.keys(ROLES.adv)[wpmAdvRoleIndex]} WPM (Advanced)`)
          }
        }
        if (wpmRoles.length > 0) callbackWarn(userInfos.maxNorm, userInfos.maxAdv, wpmRoles, removeVerified, removeVerifiedAdv);

        // Specials Roles
        function specialRole(boolean, role) {
          if (boolean) {
            if (!currentRoles.includes(role)) rolesToUpdate.toAdd.push(role);
          } else if (currentRoles.includes(role)) rolesToUpdate.toRemove.push(role);
        }

        // specialRole(userInfos.supporter, ROLES.supporter);
        // specialRole(userInfos.translator, ROLES.translator);
        // specialRole(userInfos.completionist, ROLES.completionist);
        // specialRole(userInfos.multilingual, ROLES.multilingual);

        if (userInfos.ageInYears > 0) {
          const yearRole = ROLES.age[userInfos.ageInYears];
          const yearBeforeRole = ROLES.age[userInfos.ageInYears - 1];
          if (yearBeforeRole && currentRoles.includes(yearBeforeRole))
            rolesToUpdate.toRemove.push(yearBeforeRole);
          specialRole(true, yearRole);
        }

        // Resolve Promise
        resolve(rolesToUpdate);
      });
    });
  }
};
