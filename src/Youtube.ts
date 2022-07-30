import { authenticate, LocalAuthOptions } from "@google-cloud/local-auth"
import { time } from "console";
import { PathLike, promises, readFileSync, createWriteStream, writeFile, writeFileSync, appendFile, unlinkSync } from "fs";
import { OAuth2Client } from 'google-auth-library';
const ytdl = require('ytdl-core');
import Arweave from "arweave";


import { google } from 'googleapis';
import { exit } from "process";
import { sleep } from "./Article";
let arweave
const config = JSON.parse(readFileSync("config.json").toString());
const keys = JSON.parse(readFileSync(config.walletPath).toString());

async function main() {
    arweave = Arweave.init({
        host: 'arweave.net',
        port: 443,
        protocol: 'https'
    });

    //Authenticate
    const auth = await google.auth.fromAPIKey(keys.googleAPIkey);
    google.options({ auth });

    await beginArchive(config);

}
async function beginArchive(config: any) {
    console.log("Starting YouTube archiver...");
    const youtube = google.youtube('v3');
    //this will hold the time from the start of last search
    var startTime = new Date();
    var prevStartTime = startTime;
    var keywords = config.keywords.join(" ")
    console.log(keywords);

    while (true) {
        try {
            //search using time from last search to now
            const res = await youtube.search.list({
                part: ['id', 'snippet'],
                order: "date",
                publishedAfter: prevStartTime.toISOString(),
                q: keywords,
                maxResults: 50
            }, null);
            prevStartTime = startTime;
            startTime = new Date();
            //begin parsing returned data
            if (res.data['items'] != undefined) {
                for (var i = 0; i < (res.data['items'] as Array<object>).length; i++) {
                    //adding an extra check because the YouTube API publishAfter only looks at the date
                    if (new Date(res.data['items'][i]['snippet']['publishTime']) >= prevStartTime) {
                        var url = 'http://www.youtube.com/watch?v=' + res.data['items'][i]['id']['videoId'];
                        await ytdl(url)
                            .pipe(createWriteStream(res.data['items'][i]['id']['videoId'] + '.mp4'));

                        await new Promise(res => setTimeout(res, 1000 * 10));

                        let data = readFileSync(res.data['items'][i]['id']['videoId'] + '.mp4');

                        let transaction = await arweave.createTransaction({ data: data }, keys.arweave);
                        transaction.addTag('Application', 'Permachive - YouTube Archiver');
                        transaction.addTag('Content-Type', 'video/mp4');
                        transaction.addTag('VideoId', res.data['items'][i]['id']['videoId']);
                        transaction.addTag('Title', res.data['items'][i]['snippet']['title']);
                        transaction.addTag('Description', res.data['items'][i]['snippet']['description']);
                        transaction.addTag('ChannelId', res.data['items'][i]['snippet']['channelId']);
                        transaction.addTag('ChannelTitle', res.data['items'][i]['snippet']['channelTitle']);
                        transaction.addTag('PublishTime', res.data['items'][i]['snippet']['publishTime']);

                        await arweave.transactions.sign(transaction, keys.arweave);

                        let uploader = await arweave.transactions.getUploader(transaction);

                        while (!uploader.isComplete) {
                            await uploader.uploadChunk();
                            console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
                        }
                        unlinkSync(res.data['items'][i]['id']['videoId'] + '.mp4');
                    }
                }
            }
            //sleeping for 15 minutes so it doesn't spam the endpoint and reach quotas too quick
            //Not great but Google Cloud is VERY expensive
            var msInBetween: number = Math.round((((new Date(prevStartTime.getTime() + 15 * 60000).getTime() - new Date().getTime()) % 86400000) % 3600000));
            console.log("Waiting %f min(s)...", msInBetween / 60000)
            if (msInBetween > 0) {
                await sleep(msInBetween)
            }
        }
        catch (e) {
            appendFile("./Youtube_errorlog.txt", `general error: ${e.stack ?? e.message}\n`, function (err) {
                if (err) throw err;
                console.log('Error logged to file.');
            });
            console.log(`general error: ${e.stack ?? e.message}`);
            var msInBetween: number = Math.round((((new Date(prevStartTime.getTime() + 15 * 60000).getTime() - new Date().getTime()) % 86400000) % 3600000));
            console.log("Waiting %f min(s)...", msInBetween / 60000)
            if (msInBetween > 0) {
                await sleep(msInBetween)
            }
        }
    }

}
main();