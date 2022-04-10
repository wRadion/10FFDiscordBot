const axios = require('axios').default;
const cheerio = require('cheerio');
const moment = require('moment');

const roles = require('../data/roles.json');
const achievements = require('../data/achievements.json');
const { userInfo } = require('os');

function getUserInfos(user, url, langId, compUrl, logFunction) {
  return new Promise(async (resolve, reject) => {
    const userInfos = {
      id: url.match(/(\d+)\/?$/)[1], // Get userId from 10FF profile URL
      langId: langId // Get langId from command
    };

    // Fetch page HTML
    let response = await axios.get(url).catch(reject);
    if (!response) return;

    // Load HTML with cheerio
    const $ = cheerio.load(response.data);

    // Get 10FF profile description
    const description = $('#profile-description').text();

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
    userInfos.testsTaken = parseInt($('#profile-data-table > tbody > tr:nth-child(7) > td:nth-child(2)').text().replace(/,/, ''));
    userInfos.competsTaken = parseInt($('#profile-data-table > tbody > tr:nth-child(8) > td:nth-child(2)').text().split(' ')[0].replace(/,/, ''));

    // Check if user has done at least one test
    if (userInfos.testsTaken <= 0) {
      // Reject Promise
      reject("You need to do at least one test on 10FF to have a WPM role (competitions are excluded).;;0⃣");
      return;
    }

    // Get achievement ids
    const achievement_string = response.data.match(/var achievement_string =\s*"([\d,]+)"/);

    if (achievement_string && achievement_string.length > 1) {
      const user_achievements = achievement_string[1].split(',').map(Number);

      // Specific roles (supporter + translator)
      userInfos.supporter = user_achievements.includes(48);
      userInfos.translator = user_achievements.includes(18);

      // Completionist
      userInfos.completionist = true;
      Object.keys(achievements).map(Number).forEach(id => {
        // Skip special-translator, supporter-100 && tests/comps taken
        if ((id < 18 || id > 33) && id !== 48 && !user_achievements.includes(id)) {
          userInfos.completionist = false;
        }
      });

    } else {
      // User has no achievements
      userInfos.supporter = false
      userInfos.translator = false
      userInfos.completionist = false;
    }

    // Fetch WPMs
    const reqUrl = `https://10fastfingers.com/users/get_graph_data/1/${userInfos.id}/${userInfos.langId}`;
    response = await axios.get(reqUrl, { headers: { "user-agent": "Mozilla", "x-requested-with": "XMLHttpRequest" } }).catch(reject);
    if (!response) return;

    const data = response.data;
    userInfos.langId = data.speedtest_id_active;

    // Get Max Norm/Adv score (last 400 tests)
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

    // Set max WPMs user infos
    userInfos.maxNorm = maxNorm;
    userInfos.maxAdv = maxAdv;

    // Get competition wpm (if any is given)
    if (compUrl) {
      // Get comp hash
      const hashId = compUrl.match(/([a-f0-9]+)\/?$/)[1];

      // Get language
      const { data: { Competition: compData } } = await axios.post(
        'https://10fastfingers.com/competition/view',
        `hash_id=${hashId}`,
        { headers: {
          'x-requested-with': 'XMLHttpRequest',
        } }
      ).catch(reject);

      // Check if language is good
      const compLangId = parseInt(compData.speedtest_id);

      if (compLangId !== userInfos.langId) {
        reject("The competition URL you provided is not in the right language.");
        return;
      }

      // Get competition result
      const { data: compResultPage } = await axios.post(
        'https://10fastfingers.com/competitions/get_competition_rankings',
        `hash_id=${hashId}`,
        { headers: {
          'x-requested-with': 'XMLHttpRequest',
        } }
      );

      // Load HTML and get user WPM
      const $comp = cheerio.load(compResultPage);
      const compWpm = parseInt($comp(`tr[user_id=${userInfos.id}] .wpm`).text());

      if (isNaN(compWpm)) {
        reject("You didn't participate in the competition you provided or an error occured while trying to get your WPM.");
        return;
      }

      if (userInfos.maxNorm < compWpm) {
        userInfos.maxNorm = compWpm;
      }
    }

    // Check Multilingual (at least 50 tests in 10 languages)
    userInfos.multilingual = data.languages_sorted.filter(a => parseInt(a['0'].anzahl) >= 50).length >= 10;

    // Year age member
    let dateStr = $('#profile-data-table > tbody > tr:nth-child(3) > td:nth-child(2)').text();
    if (dateStr.startsWith('on ')) {
      const split = dateStr.substring(3).replaceAll(' ', '').split(',')
      const month = Number({ 'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6, 'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12 }[split[0]]);
      const day = Number(split[1].match(/(\d+)/)[0]) - 1;
      const year = Number(split[2]);
      userInfos.ageInYears = moment().diff([year, month - 1, day], 'years');
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
        if (userInfos.ageInYears > 0) {
          const yearRole = roles.age[userInfos.ageInYears];
          const yearBeforeRole = roles.age[userInfos.ageInYears - 1];
          if (yearBeforeRole && currentRoles.includes(yearBeforeRole))
            rolesToUpdate.toRemove(push(yearBeforeRole))
          specialRole(true, yearRole);
        }

        // Resolve Promise
        resolve(rolesToUpdate);
      });
    });
  }
};
