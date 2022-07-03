// const {
//     config,
// } = require("dotenv");

// config();

module.exports = // ecosystem.js
{
    "apps": [
        {
            "name": "Twitter Archiver",
            "script": "build/Twitter.js",
        },
        {
            "name": "Article Archiver",
            "script": "build/Article.js",
        }
    ],
};