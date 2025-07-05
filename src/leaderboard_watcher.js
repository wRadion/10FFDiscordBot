require('dotenv').config();

const axios = require('axios').default;
const cheerio = require('cheerio');
const google = require('@googleapis/sheets');
const fs = require('fs');
const qs = require('querystring');

const LANGUAGES = require('../data/languages.json');

function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
}

module.exports = class LeaderboardWatcher {
  constructor(discordServer, users, channelId) {
    this.discordServer = discordServer;
    this.googleAuth = null;
    this.googleSheetsInstance = null;
    this.db = null;
    this.languages = LANGUAGES.filter(l => l !== null).sort((a, b) => a.name.localeCompare(b.name));
    this.users = users;
    this.channelId = channelId;
    this.channel = null;
    this.hasRecordUpdates = false;
    this.hasAccountChanges = false;
  }

  async sendDebug(message) {
    const user = await this.discordServer.members.fetch(this.users.wradion);
    const channel = await user.createDM();
    await channel.send(message.trim());
  }

  async sendMessage(message) {
    if (!this.discordServer) return;
    if (!this.channel) {
      this.channel = await this.discordServer.channels.resolve(this.channelId);
    }
    await this.channel.send(message.trim());
  }

  async fetchGoogleSheetsInstance() {
    this.googleAuth = new google.auth.GoogleAuth({
      keyFile: "./keys.json",
      scopes: "https://www.googleapis.com/auth/spreadsheets"
    });
    const authClientObject = await this.googleAuth.getClient();
    this.googleSheetsInstance = google.sheets({ version: "v4", auth: authClientObject });
  }

  async start(startIndex, endIndex) {
    await this.fetchGoogleSheetsInstance();

    if (startIndex === 0) {
      this.hasRecordUpdates = false;
      await this.updateCompetitions();
    }

    for (let i = startIndex; i < endIndex; ++i) {
      const langObj = this.languages[i];
      if (langObj === null || langObj === undefined)
        continue;
      await this.processLang(langObj, false);
      if (langObj.advStaffSheetId.length > 0)
        await this.processLang(langObj, true);
    }

    if (!this.hasRecordUpdates && endIndex === 57) {
      await this.sendMessage("_No update detected for today._");
    }
  }

  async updateCompetitions() {
    await this.fetchGoogleSheetsInstance();
    console.log('Updating competitions...');
    let allComps = JSON.parse(fs.readFileSync('./data/competitions.json'));

    const timezoneOffset = new Date().getTimezoneOffset();
    for (let i = 0; i < LANGUAGES.length; ++i) {
      if (LANGUAGES[i] === null || LANGUAGES[i].compStaffSheetId.length <= 0) continue;
      console.log(`- Updating competitions for ${LANGUAGES[i].name}...`);

      const langComps = allComps.filter(c => c.langId === i);
      let allRecords = [];
      console.log('Found', langComps.length, 'competitions.');

      for (const comp of langComps) {
        const end = new Date(parseInt(comp.compId.substring(0, 8), 16) * 1000);
        end.setMinutes(end.getMinutes() - timezoneOffset + 24 * 60 + 1.5);
        if (new Date() > end) {
          allComps = allComps.filter(c => c.compId !== comp.compId);
          allRecords = allRecords.concat(await this.getCompetitionLeaderboard(LANGUAGES[i].name, comp.compId));
        }
      }

      allRecords = allRecords.filter(r => allRecords.filter(cr => cr.userId === r.userId && cr.cpm > r.cpm).length === 0);

      if (allRecords.length > 0) {
        await this.processLang(LANGUAGES[i], false, allRecords);
      }
    }

    const activeComps = await this.getActiveCompetitions();

    for (const comp of activeComps) {
      if (!allComps.find(c => c.langId === comp.langId && c.compId === comp.compId))
        allComps.push(comp);
    }

    fs.writeFileSync('./data/competitions.json', JSON.stringify(allComps, null, 2));
    console.log('Competitions updated.');
  }

  async detectAccountsChange(startIndex, endIndex, detectNameChange = false) {
    await this.fetchGoogleSheetsInstance();

    if (startIndex === 0)
      this.hasAccountChanges = false;

    for (let i = startIndex; i < endIndex; ++i) {
      const langObj = this.languages[i];
      if (langObj === null)
        continue;
      await this.detectAccountsChangeLang(langObj, false, detectNameChange);
      if (langObj.advStaffSheetId.length > 0)
        await this.detectAccountsChangeLang(langObj, true, detectNameChange);
    }

    if (!this.hasAccountChanges && endIndex === 57) {
      await this.sendMessage(`_No account changes detected for today._`);
    }
  }

  async processLang(langObj, advanced, competitionRecords = null) {
    const lang = langObj.name;
    console.log(`Starting for language ${lang}${competitionRecords ? ' (Competition)' : (advanced ? ' (Advanced)' : ' (Normal)')}...`);

    let siteRecords;
    if (competitionRecords)
      siteRecords = competitionRecords;
    else
      siteRecords = await this.getTop20Leaderboard(lang, advanced);

    let sheetRecords = null;
    let message = '';

    if (langObj.emoji)
      message += langObj.emoji + ' ';
    message += `__**${capitalize(lang)}**__ (_${competitionRecords ? 'competition' : (advanced ? 'advanced' : 'normal')}_)\n`;

    try {
      sheetRecords = await this.getRecords(langObj, advanced, !!competitionRecords);
    } catch (err) {
      console.log(err);
      message += `:x: There was an error fetching ${lang} spreadsheet:\n\`\`\`\n`;
      message += err;
      message += '```';
      await this.sendMessage(message);
      return;
    }

    const diff = await this.getDiff(siteRecords, sheetRecords, lang);

    if (diff.toAdd.length === 0 && diff.toUpdate.length === 0 && diff.english180.length === 0)
      return;
    this.hasRecordUpdates = true;

    for (const rec of diff.toAdd) {
      console.log(`Inserted: ${JSON.stringify(rec)}`);

      const wpm = Math.floor((rec.cpm + 2) / 5);
      message += `New: **[${rec.name}](<https://10fastfingers.com/user/${rec.userId}>)** \`${wpm} WPM (${rec.cpm})\``;
      if (rec.compId)
        message += ` - <https://10fastfingers.com/competition/${rec.compId}>`;
      message += "\n"
    }
    for (const rec of diff.toUpdate) {
      console.log(`Updated: ${JSON.stringify(rec.old)}`);
      console.log(`     to: ${JSON.stringify(rec.new)}`);

      const oldWpm = Math.floor((rec.old.cpm + 2) / 5);
      const newWpm = Math.floor((rec.new.cpm + 2) / 5);
      if (rec.new.name !== rec.old.name) {
        message += `Update + name change: **[${rec.old.name} -> ${rec.new.name}](<https://10fastfingers.com/user/${rec.old.userId}>)**`;
      } else {
        message += `Update: **[${rec.old.name}](<https://10fastfingers.com/user/${rec.old.userId}>)**`;
      }
      message += ` \`${oldWpm} -> ${newWpm} WPM (${rec.old.cpm} -> ${rec.new.cpm})\``;
      if (rec.new.compId)
        message += ` - <https://10fastfingers.com/competition/${rec.new.compId}>`;
      message += "\n"
    }
    for (const rec of diff.english180) {
      console.log(`English 180 WPM: ${JSON.stringify(rec)}`);

      const wpm = Math.floor((rec.cpm + 2) / 5);
      message += `180+ WPM: **[${rec.name}](<https://10fastfingers.com/user/${rec.userId}>)** \`${wpm} WPM (${rec.cpm})\` - `;
      if (rec.compId)
        message += `https://10fastfingers.com/competition/${rec.compId}`;
    }

    if (message.length < 2000) {
      await this.sendMessage(message);
    } else {
      let msg = '';
      const lines = message.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (msg.length + lines[i].length > 2000) {
          await this.sendMessage(msg);
          msg = '';
        }
        msg += lines[i] + '\n';
      }
      if (msg.length > 0)
        await this.sendMessage(msg);
    }
  }

  async detectAccountsChangeLang(langObj, advanced, detectNameChange) {
    const lang = langObj.name;

    let message = null;
    let records = null;

    try {
      records = await this.getRecords(lang, advanced);
    } catch (err) {
      console.log(err);
      return;
    }

    console.log(`Looking for account changes for ${lang}...`);
    for (const record of records) {
      const url = `https://10fastfingers.com/user/${record.userId}`;
      const wpm = Math.floor((record.cpm + 2) / 5);

      let error = null;
      let response = null;

      try {
        response = await axios.get(url, { timeout: 3000 }).catch((err) => error = err);
        if (!response || error) {
          console.log(error.message);
          continue;
        }
      } catch (err) {
        console.log(err.message);
        continue;
      }

      if (response.request.path !== `/user/${record.userId}`) {
        if (!message) {
          message = '';
          if (langObj.emoji)
            message += langObj.emoji + ' ';
          message += `__**${capitalize(lang)}**__ (_${advanced ? 'advanced' : 'normal'}_)\n`;
        }
        const newLine = `Account deleted: **${record.name}** \`${wpm} WPM (${record.cpm})\` - ${url}\n`;
        if (message.length + newLine.length >= 2000) {
          await this.sendMessage(message);
          message = '';
        }
        message += newLine;
        console.log(`Account deleted: ${JSON.stringify(record)}`);
      } else if (detectNameChange) {
        const $ = cheerio.load(response.data);
        const username = $('#main-content > div > h2').text().replace(/  /g, '').split('\n')[2].trim();

        if (record.name !== username) {
          if (!message) {
            message = '';
            if (langObj.emoji)
              message += langObj.emoji + ' ';
            message += `__**${capitalize(lang)}**__ (_${advanced ? 'advanced' : 'normal'}_)\n`;
          }
          const newLine = `Account rename: ${record.name} -> **${username}** \`${wpm} WPM (${record.cpm})\` - ${url}\n`;
          if (message.length + newLine.length >= 2000) {
            await this.sendMessage(message);
            message = '';
          }
          message += newLine;
          console.log(`Account rename: ${JSON.stringify(record)} to "${username}"`);
        }
      }
    }

    if (message) {
      this.hasAccountChanges = true;
      await this.sendMessage(message);
    } else {
      console.log(`No account changes detected for ${lang}.`);
    }
  }

  async getDiff(siteRecords, sheetRecords, lang) {
    const result = { toAdd: [], toUpdate: [], english180: [] }

    for (const siteRec of siteRecords) {
      const inSheet = sheetRecords.find(r => r.userId == siteRec.userId);

      if (siteRec.cpm <= sheetRecords[0].cpm && sheetRecords.length >= 100) {
        if (!inSheet && lang === "english" && siteRec.cpm >= 900) {
          result.english180.push(siteRec);
        }
        continue;
      }

      if (inSheet) {
        if (siteRec.cpm > inSheet.cpm) {
          result.toUpdate.push({ old: inSheet, new: siteRec });
        }
      } else {
        result.toAdd.push(siteRec);
      }
    }

    return result;
  }

  /*
   * Returns:
   * Array of {
   *   cpm: number,
   *   name: string,
   *   userId: string
   * }
   */
  async getRecords(lang, advanced = false, competition = false) {
    if (competition && !lang.compStaffSheetId) return [];
    if (advanced && !lang.advStaffSheetId) return [];
    if (!lang.staffSheetId) return [];

    console.log(`Fetching spreadsheet data for ${lang.name} ${competition ? '(competition)' : (advanced ? '(advanced)' : '(normal)')}...`)
    const readData = await this.googleSheetsInstance.spreadsheets.values.batchGet({
      auth: this.googleAuth, spreadsheetId: competition ? lang.compStaffSheetId : (advanced ? lang.advStaffSheetId : lang.staffSheetId), ranges: ['C2:C', 'D2:D', 'E2:E']
    });

    if (readData.data && readData.data.valueRanges && readData.data.valueRanges.length === 3) {
      const cpms = readData.data.valueRanges[0].values.flat();
      const names = readData.data.valueRanges[1].values.flat();
      const userIds = readData.data.valueRanges[2].values.flat();

      let records = [];
      for (let i = 0; i < cpms.length; ++i) {
        if (!cpms[i]) continue;
        records.push({ cpm: Number(cpms[i]), name: names[i], userId: userIds[i].split('user/')[1].split('/')[0] })
      }
      if (lang.name !== "english" || advanced)
        records = records.slice(0, 100);
      return records.reverse();
    } else {
      console.log('Error while fetching spreadsheet data:');
      console.log(readData);
      return [];
    }
  }

  async getTop20Leaderboard(lang, advanced) {
    const langId = LANGUAGES.findIndex(l => l !== null && l.name === lang);
    const url = `https://10fastfingers.com/speedtests/render_highscore_get_top_ranking/${langId}/${advanced ? '2' : '1'}`;

    // Fetch page HTML
    console.log(`Fetching ${lang} ${advanced ? 'advanced' : 'normal'} top20 leaderboard...`);
    let error = null;
    let response = await axios.get(url, { timeout: 10000 }).catch((err) => error = err);
    if (!response || error) {
      console.log(error);
      return [];
    }

    // Load HTML with cheerio
    const $ = cheerio.load(response.data);

    // Get top 20
    let result = [];

    const top20 = $('table tbody tr');
    for (const row of top20) {
      const name = $(row).find('td.username').text();
      const userId = $(row).attr('user_id');
      const cpm = parseInt($(row).find('td.wpm').attr('title'));

      result.push({ cpm, name, userId, lang, advanced: advanced });
    }

    return result;
  }

  async getActiveCompetitions() {
    const url = 'https://10fastfingers.com/competitions';

    // Fetch page HTML
    console.log(`Fetching current active competitions...`);
    let error = null;
    let response = await axios.get(url, { timeout: 10000 }).catch((err) => error = err);
    if (!response || error) {
      console.log(error);
      return [];
    }

    // Load HTML with cheerio
    const $ = cheerio.load(response.data);

    // Get competitions
    let comps = [];

    const competitions = $('table#join-competition-table tbody tr');

    for (const row of competitions) {
      const langId = parseInt($(row).find('span.flag').attr('id').substring(6));
      const compId = $(row).find('a.btn').attr('href').split('/')[2];

      if (LANGUAGES[langId] && LANGUAGES[langId].compStaffSheetId.length > 0)
        comps.push({ langId, compId });
    }

    return comps;
  }

  async getCompetitionLeaderboard(lang, compId) {
    const url = 'https://10fastfingers.com/competitions/get_competition_rankings';

    // Fetch page HTML
    console.log(`Fetching competition ${compId} leaderboard...`);
    let error = null;
    let response = await axios.post(url, qs.stringify({ hash_id: compId }), { timeout: 10000, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' } }).catch((err) => error = err);
    if (!response || error) {
      console.log(error);
      return [];
    }

    // Load HTML with cheerio
    const $ = cheerio.load(response.data);

    // Get ranking
    let result = [];

    const ranking = $('#competition-rank-table table tbody tr');

    for (const row of ranking) {
      const name = $(row).find('td.username').text();
      const userId = $(row).attr('user_id');
      const cpm = parseInt($(row).find('td.keystrokes').text().replace(/[\(\)]/, ''));

      if (!cpm || name.length <= 0 || result.find(r => r.userId === userId))
        continue;

      result.push({ cpm, name, userId, lang, advanced: false, compId });
    }

    return result;
  }
}
