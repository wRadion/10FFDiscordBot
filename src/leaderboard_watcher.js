require('dotenv').config();

const axios = require('axios').default;
const cheerio = require('cheerio');
const { google } = require('googleapis');

function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
}

module.exports = class LeaderboardWatcher {
  constructor(discordServer, languages, users, channelId) {
    this.discordServer = discordServer;
    this.googleAuth = null;
    this.googleSheetsInstance = null;
    this.db = null;
    this.languages = languages.filter(l => l !== null).sort((a, b) => a.name.localeCompare(b.name));
    this.users = users;
    this.channelId = channelId;
    this.channel = null;
  }

  async sendMessage(message) {
    if (!this.discordServer) return;
    if (!this.channel) {
      this.channel = await this.discordServer.channels.resolve(this.channelId);
      //const user = await this.discordServer.members.fetch(this.users.wradion);
      //this.channel = await user.createDM();
    }
    await this.channel.send(message.trim());
  }

  async fetchGoogleSheetsInstance() {
    this.googleAuth = new google.auth.GoogleAuth({
      keyFile: "../keys.json",
      scopes: "https://www.googleapis.com/auth/spreadsheets"
    });
    const authClientObject = await this.googleAuth.getClient();
    this.googleSheetsInstance = google.sheets({ version: "v4", auth: authClientObject });
  }

  async start() {
    await this.fetchGoogleSheetsInstance();

    for (const langObj of this.languages) {
      const lang = langObj.name;
      console.log(`Starting for language ${lang}...`);

      const top50 = await this.getTop50Leaderboard(lang);

      let records = null;
      let message = '';
      try {
        records = await this.getRecords(lang);
      } catch (err) {
        console.log(err);
        if (langObj.emoji)
          message += langObj.emoji + ' ';
        message += `__**${capitalize(lang)}**__ (_normal_)\n`;
        message += `:x: There was an error fetching ${lang} spreadsheet.`;
        await this.sendMessage(message);
        continue;
      }

      const diff = await this.getDiff(top50, records);

      if (diff.toAdd.length === 0 && diff.toUpdate.length === 0)
        continue;

      if (langObj.emoji)
        message += langObj.emoji + ' ';
      message += `__**${capitalize(lang)}**__ (_normal_)\n`;

      for (const rec of diff.toAdd) {
        console.log(`Inserted: ${JSON.stringify(rec)}`);

        const wpm = Math.floor((rec.cpm + 2) / 5);
        message += `New: **${rec.name}** \`${wpm} WPM (${rec.cpm})\` - https://10fastfingers.com/user/${rec.userId}\n`;
      }
      for (const rec of diff.toUpdate) {
        console.log(`Updated: ${JSON.stringify(rec.old)}`);
        console.log(`     to: ${JSON.stringify(rec.new)}`);

        const oldWpm = Math.floor((rec.old.cpm + 2) / 5);
        const newWpm = Math.floor((rec.new.cpm + 2) / 5);
        if (rec.new.name !== rec.old.name) {
          message += `Update + name change: **${rec.old.name} -> ${rec.new.name}**`;
        } else {
          message += `Update: **${rec.old.name}**`;
        }
        message += ` \`${oldWpm} -> ${newWpm} WPM (${rec.old.cpm} -> ${rec.new.cpm})\` - https://10fastfingers.com/user/${rec.old.userId}\n`;
      }

      await this.sendMessage(message);
    }
  }

  async detectAccountsChange(detectNameChange = false) {
    await this.fetchGoogleSheetsInstance();

    for (const langObj of this.languages) {
      const lang = langObj.name;

      let message = null;
      let records = null;

      try {
        records = await this.getRecords(lang);
      } catch (err) {
        console.log(err);
        continue;
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
            message += `__**${capitalize(lang)}**__ (_normal_)\n`;
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
              message += `__**${capitalize(lang)}**__ (_normal_)\n`;
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
        await this.sendMessage(message);
      } else {
        console.log(`No account changes detected for ${lang}.`);
      }
    }
  }

  async getDiff(top50, records) {
    const result = { toAdd: [], toUpdate: [] }

    for (const rec of top50) {
      if (rec.cpm <= records[0].cpm && records.length >= 100) continue;

      const inRecords = records.find(r => r.userId === rec.userId);
      if (inRecords) {
        if (rec.cpm > inRecords.cpm) {
          result.toUpdate.push({ old: inRecords, new: rec });
        }
      } else {
        result.toAdd.push(rec);
      }
    }

    return result;
  }

  async getRecords(language) {
    const lang = this.languages.find(l => l.name === language);
    if (!lang) return [];

    console.log(`Fetching spreadsheet data for ${lang.name}...`)
    const readData = await this.googleSheetsInstance.spreadsheets.values.batchGet({
      auth: this.googleAuth, spreadsheetId: lang.staffSheetId, ranges: ['C2:C', 'D2:D', 'E2:E']
    });

    if (readData.data && readData.data.valueRanges && readData.data.valueRanges.length === 3) {
      const cpms = readData.data.valueRanges[0].values.flat();
      const names = readData.data.valueRanges[1].values.flat();
      const userIds = readData.data.valueRanges[2].values.flat();

      let records = [];
      for (let i = 0; i < cpms.length; ++i) {
        if (!cpms[i]) continue;
        records.push({ cpm: Number(cpms[i]), name: names[i], userId: userIds[i].split('/')[4] })
      }
      return records.slice(0, 100).reverse();
    } else {
      console.log('Error while fetching spreadsheet data:');
      console.log(readData);
      return [];
    }
  }

  async getTop50Leaderboard(language) {
    let langUrl = language;
    if (language.startsWith('chinese')) {
      const split = language.split('_');
      langUrl = split[1] + '-' + split[0];
    }
    const url = `https://10fastfingers.com/typing-test/${langUrl}/top50`

    // Fetch page HTML
    console.log('Fetching top50 leaderboard...');
    let error = null;
    let response = await axios.get(url, { timeout: 10000 }).catch((err) => error = err);
    if (!response || error) {
      console.log(error);
      return [];
    }

    // Load HTML with cheerio
    const $ = cheerio.load(response.data);

    // Get top 50
    let result = [];

    const top50 = $('#main-content > div > table tbody tr');
    for (const row of top50) {
      const userCol = $(row).find('td:nth-child(3)');
      const name = userCol.text();
      const userId = userCol.find('a').attr('href').split('/')[2];
      const cpm = Number($(row).find('td:nth-child(5)').text());

      result.push({ cpm, name, userId, lang: language });
    }

    return result;
  }
}