# Permachive Archivers - tools which record tweets, posts, and articles - permanently storing them on Arweave via Bundlr

*The program is heavily influenced by Bundlr's open source program [ARchivers](https://github.com/Bundlr-Network/ARchivers)*

To run either Twitter or Article Archiver, you need an Arweave wallet - more specifically an Arweave wallet file.
You need to copy the contents of this wallet file into the example (example.wallet.json) wallets' "arweave" section.

You also need to have docker and a set of build tools installed (for not LTS node versions).  

Run `yarn` to install dependencies.

Docker command to create headless chrome host:
`docker run --shm-size=4096m -e KEEP_ALIVE=true -e MAX_CONCURRENT_SESSIONS=60 -e MAX_QUEUE_LENGTH=400 -e CONNECTION_TIMEOUT=180000 -p 3000:3000 --restart always -d --name bc browserless/chrome`

Tweak the `MAX_CONCURRENT_SESSIONS` value as required - higher = more load but a higher chance of content being archived (download requests are dropped if the queue gets too full).

# Twitter Archiver
To run the Twitter Archiver you need Twitter API keys, which you can get via a Twitter developer account.
**You will also need elevated API access.**
Follow this answer here, and fill in the relevant fields in example.wallet.json:  
https://stackoverflow.com/a/6875024/18012461
and then rename it to wallet.json.

Then in the developer portal, request elevated access - this should be approved almost immediately.

# Article Archiver
For the Article Archiver, you need a NewsAPI API key - which you can get at https://newsapi.org.  
Add this to your `wallet.json` (or example.wallet.json - rename to wallet.json)  
(it can be run without as an external import - just don't invoke `updateNewsApi`).

Tweak config.json as required, adding in `keyterms` - tweak `instances` to about 80% of your `MAX_CONCURRENT_SESSIONS` value.  

If you are noticing too many re-uploads of unchanged data, or that the system is not responding to changes, change the `difference` value in the config - lower = more sensitive to changes.  
Remember to change the `queryID` value in the configuration to distinguish your collection from others - you can always filter by owner address, but this allows for more fine grained control.

# YouTube Archiver
For the YouTube archiver, you will need a Google API Youtube Data V3 API key. You will need to create a project in Google Cloud and enable the YouTube Data API v3 API. You will then be able to create an API key to use. Here is a link to the Google Cloud console: https://console.cloud.google.com/apis/api/youtube.googleapis.com

Due to the quotas on this API, only 100 requests a day are allowed without paying. Quotas are tracked through "points" with a daily limit of 10,000. Each call to the YouTube API costs 100 points. Google Cloud isn't the cheapest platform, thus why we went in this direction. If you would like to pay for a higher quota, you can remove lines 84-90 in the YouTube.ts file.

This program concatenates the keywords from `config.json` and uses that as the query. 

### Running

Install PM2 globally (use elevated terminal):   

`yarn global add pm2`  

Build the project:  

`yarn build`  

Start the project (All archivers): 
 
`pm2 start Archiver.ecosystem.config.js`  

