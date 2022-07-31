# **Permachive Archivers - tools which record tweets, posts, and articles - permanently storing them on Arweave via Bundlr**

*The program is heavily influenced by Bundlr's open source program [ARchivers](https://github.com/Bundlr-Network/ARchivers)*

To run any of the archivers, you need an Arweave wallet - more specifically an Arweave wallet file. You need to copy the contents of this wallet file into the example (example.wallet.json) wallets' "arweave" section.

You also need to have docker and a set of build tools installed (for not LTS node versions).

Run `yarn` to install dependencies.

Docker command to create headless chrome host: `docker run --shm-size=4096m -e KEEP_ALIVE=true -e MAX_CONCURRENT_SESSIONS=60 -e MAX_QUEUE_LENGTH=400 -e CONNECTION_TIMEOUT=180000 -p 3000:3000 --restart always -d --name bc browserless/chrome`

Tweak the `MAX_CONCURRENT_SESSIONS` value as required - higher = more load but a higher chance of content being archived (download requests are dropped if the queue gets too full).

## **Twitter Archiver**

To run the Twitter Archiver you need Twitter API keys, which you can get via a Twitter developer account. **You will also need elevated API access.** Follow this answer here, and fill in the relevant fields in example.wallet.json:[https://stackoverflow.com/a/6875024/18012461](https://stackoverflow.com/a/6875024/18012461) and then rename it to wallet.json.

Then in the developer portal, request elevated access - this should be approved almost immediately.

This section gets a filtered stream of tweets using node-tweet-stream JavaScript library, which leverages the official Twitter API. This is filtered based on keywords, which are pulled from the config.json file. When a tweet comes in, it goes to the processTweet function, scraping all the data out of it. This data is compiled into an object. Once the data scraping is complete, the URL is pulled from the data and passed to the Puppeteer functions to take screenshots. The screenshot is saved an a .png file. The tags are created from the Twitter data, and the original data object is converted into a JSON string and assigned to a tag. Bundlr is then called to create a transaction, passing the .png screenshot and the tags. After signing and uploading the transaction, the .png file is deleted locally, as it has already been pushed to Arweave.

If the image size is greater than 100kb, the photo is compressed using the [compress-images](https://www.npmjs.com/package/compress-images) npm package. Even after compressing, there may be some files over 100kb, but the majority we have ran into while testing were compressed to under 100kb. This cuts a lot of the cost of upkeep for this archiver thanks to Bundlr’s policy of free transactions under 100kb.

Error logging to a file as been added. Errors will log to a `Twitter-errorlog.txt` file.

New changes were added to remove some elements from the page before taking a screenshot to improve the readability of the screenshot. Some screenshots still contain the loading wheel, but due to how Twitter’s code handles it’s visibility, I could not find a way to hide it. 

## **Article Archiver**

For the Article Archiver, you need a NewsAPI API key - which you can get at [https://newsapi.org](https://newsapi.org/). Add this to your `wallet.json` (or example.wallet.json - rename to wallet.json)(it can be run without as an external import - just don't invoke `updateNewsApi`).

Tweak config.json as required, adding in `keyterms` - tweak `instances` to about 80% of your `MAX_CONCURRENT_SESSIONS` value.

If you are noticing too many re-uploads of unchanged data, or that the system is not responding to changes, change the `difference` value in the config - lower = more sensitive to changes.Remember to change the `queryID` value in the configuration to distinguish your collection from others - you can always filter by owner address, but this allows for more fine grained control.

This section pulls from the NewsAPI endpoint using a keyword. Once it has its results, it checks a local SQLite database file to see if it has uploaded that before or if it is a new version of an article it has already uploaded. If it is new or an updated version of an existing one, it’s HTML code is pulled and converted to be fully standalone. Making is standalone strips out any external resources, which is essential to keeping it stored forever. The tags are created using the data from the page, and Bundlr is called passing in the HTML code and tags.

Error logging to a file as been added. Errors will log to a `Article-errorlog.txt` file.
## YouTube Archiver

For the YouTube archiver, you will need a Google API Youtube Data V3 API key. You will need to create a project in Google Cloud and enable the YouTube Data API v3 API. You will then be able to create an API key to use. Here is a link to the Google Cloud console: [https://console.cloud.google.com/apis/api/youtube.googleapis.com](https://console.cloud.google.com/apis/api/youtube.googleapis.com)

Due to the quotas on this API, only 100 requests a day are allowed without paying. Quotas are tracked through "points" with a daily limit of 10,000. Each call to the YouTube API costs 100 points. Google Cloud isn't the cheapest platform, thus why we went in this direction. If you would like to pay for a higher quota, you can remove lines 84-90 in the YouTube.ts file. This extra code limits the archiver from calling the YouTube API once every 15 minutes. The time it waits is the difference in 15 minutes after it last called it and the time it finishes archiving. So if it calls the API and takes 5 minutes to parse and upload the videos, the program will then wait 10 minutes after.

This program concatenates the keywords from `config.json` and uses that as the query.

Due to the nature of videos being a larger size, this section using Arweave directly to upload instead of Bundlr like previous pieces. This is due to Arweave being more cost efficient than Bundlr for files larger than 200kb.

Error logging to a file as been added. Errors will log to a `YouTube-errorlog.txt` file.

**Running**

Install PM2 globally (use elevated terminal):

`yarn global add pm2`

Build the project:

`yarn build`

Start the project (All archivers):

`pm2 start Archiver.ecosystem.config.js`