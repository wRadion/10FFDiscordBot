# 10FF Roles Request Bot

## Index
1. [Summary](#summary)
2. [Identification](#identification)
3. [Roles](#roles)
    - [Verified](#verified) ✅
4. [Additional Information](#additional-information)
    - [Language](#language)
    - [Maximum WPM](#maximum-wpm)
5. [Bug, issues, suggestions](#bug-issues-suggestions)

## Summary

Usage:
```
!roles <your 10FF profile URL>
```

Example:
```
!roles https://10fastfingers.com/user/209050/
```

The command only works in the **#role-requests** channel.

## Identification

If your Discord username is not exactly the same as your 10FF username, you will need to put your Discord full tag (e.g. __Discord#0000__) in your 10FF description so the bot will be able to see that it's **your** profile.

## Roles

This bot gives those roles automatically:
- **10FF Supporter ❤**
- **Site Translator ✒**
- **Completionist**
- **Multilingual :keyboard:**

Plus **WPM** and **WPM (Advanced)** roles.

Plus **Tests Taken** roles.

Plus **Competitions Taken** roles.

### Verified ✅

If you reach 200+ WPM in normal or advanced, the bot will automatically remove your **Verified ✅** role (if you have one).
A Discord moderator will have to check manually your new speed to (re)add the role.

## Additional Information

If you're not happy with your max scores (you think it's too high, or you wish to use your average), you can add your requested roles for normal and advanced:
```
!roles https://10fastfingers.com/user/209050/ 150 130
```
Even though I can have the **170-179 WPM** and the **140-149 WPM (Advanced)** roles with the max detected scores, the command above will give me the **150-159 WPM** and **130-139 WPM (Advanced)** roles.

### Language

If your main language (the language in which you did the most tests) is not the language you wish to use for your WPM roles, you can add it to the command:
```
!roles https://10fastfingers.com/user/209050/ english
```

Currently, all languages are supported except for **Chinese (Traditional)** and **Chinese (Simplified)**.

### Maximum WPM

Obviously, you can't request a WPM role that is higher that your highest score. The bot only sees your last 400 tests in normal+advanced, plus your lasts 10 competitions.

For competitions, the bot will only pick the competitions in your main language. For example, if you have 4 competitions in your main language in the last 10 competitions, the bot will only see those 4 competitions.

## Bug, issues, suggestions

If you have any problem with the bot please feel free to report the bugs to me on Discord (**wRadion#5043**) or by email [me@wradion.dev](mailto:me@wradion.dev). You can also find me on the official 10FF Discord. 
