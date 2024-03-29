import Twitter from "node-tweet-stream";
import Bundlr from "@bundlr-network/client"
import tmp, { fileSync } from "tmp-promise"
import * as p from "path"
import { mkdir, unlink } from "fs/promises";
import { appendFile, PathLike, promises, readFileSync } from "fs";
import { createWriteStream } from "fs";
import { getPage, navigatePageSimple } from './lib/puppeteer-setup';
import axios from "axios"
import Article from "./Article";
import fs from "fs";
import { Mutex, MutexInterface, Semaphore, SemaphoreInterface, withTimeout } from 'async-mutex';
import { release } from "os";

const compress_images = require("compress-images");

let TPS = 0;
let pTPS = 0;
let total = 0;
setInterval(() => {
    total += pTPS;
    console.log(`TPS: ${TPS} - pTPS: ${pTPS} - total: ${total}`); TPS = 0; pTPS = 0
}, 1000)

setInterval(async () => {
    const balance = (await bundlr.getLoadedBalance()) / 1e12;
    console.log("Balance check. Current balance: " + balance + " AR");
    // If balance is < 1 AR
    if (balance < 1) {
        // Fund your account with 1 AR
        console.log("Balance below 1 AR. Funding node with 1 AR...");
        await bundlr.fund(1e12);
    }
}, 900000); //Once every 15 minutes, check the funds

const checkPath = async (path: PathLike): Promise<boolean> => { return promises.stat(path).then(_ => true).catch(_ => false) }

let twitter
let bundlr
let article: Article;
const mutex = new Mutex();

async function main() {

    const config = JSON.parse(readFileSync("config.json").toString());
    const keys = JSON.parse(readFileSync(config.walletPath).toString());

    twitter = new Twitter({
        consumer_key: keys.tkeys.consumer_key,
        consumer_secret: keys.tkeys.consumer_secret,
        token: keys.tkeys.token,
        token_secret: keys.tkeys.token_secret,
        tweet_mode: "extended"
    })
    bundlr = new Bundlr(config.bundlrNode, "arweave", keys.arweave)
    article = new Article(config)

    //initial funding check
    const balance = (await bundlr.getLoadedBalance()) / 1e12;
    console.log("Balance check. Current balance: " + balance + " AR");
    // If balance is < 1 AR
    if (balance < 1) {
        // Fund your account with 1 AR
        console.log("Balance below 1 AR. Funding node with 1 AR...");
        await bundlr.fund(1e12);
    }

    console.log(`Loaded with account address: ${bundlr.address}`)
    //await processTweet(tweet)
    twitter.on('tweet', processTweet)

    twitter.on('error', (e) => {
        console.error(`tStream error: ${e.stack}`)
    })
    const trackKeyWords = config.keywords
    // const trackUsers = config.userIDs
    console.log(`Tracking key words: ${trackKeyWords}`);
    // console.log(`Tracking users: ${trackUsers}`)
    twitter.track(trackKeyWords)
    // twitter.follow(trackUsers)
    // twitter.follow("957688150574469122")
}

async function processTweet(tweet) {
    let tmpdir;
    try {

        TPS++
        if (tweet.retweeted_status) { //retweet, ignore.
            return;
        }


        /**
         * Application: Permachive - Twitter Archiver
         * Author-ID: author ID: int
         * Tweet-ID: tweet ID: int
         * Media-Manifest-ID: media manifest ID: int
         * Key-Word-List: keyword set : string
         */

        const tags = [
            { name: "Application", value: "Permachive - Twitter Archiver" },
            { name: "Tweet-ID", value: `${tweet.id_str}` },
            { name: "Author-ID", value: `${tweet.user.id_str}` },
            { name: "Author-Name", value: `${tweet.user.name}` },
            { name: "Author-Handle", value: `@${tweet.user.screen_name}` },
            { name: "Content-Type", value: "image/png" },
            { name: "Key-Word-List", value: "Ethiopia" },
            { name: "Tweet-Content", value: JSON.stringify(tweet) }
        ];

        if (tweet?.in_reply_to_status_id) {
            tags.push({ name: "In-Response-To-ID", value: `${tweet.in_reply_to_status_id_str}` })
        }

        if (tweet?.extended_entities?.media?.length > 0) {
            try {
                if (!tmpdir) {
                    tmpdir = await tmp.dir({ unsafeCleanup: true })
                }
                const mediaDir = p.join(tmpdir.path, "media")
                if (!await checkPath(mediaDir)) {
                    await mkdir(mediaDir)
                }
                for (let i = 0; i < tweet.extended_entities.media.length; i++) {
                    const mobj = tweet.extended_entities.media[i]
                    const url = mobj.media_url
                    if ((mobj.type === "video" || mobj.type === "animated_gif") && mobj?.video_info?.variants) {
                        const variants = mobj?.video_info?.variants.sort((a, b) => ((a.bitrate ?? 1000) > (b.bitrate ?? 1000) ? -1 : 1))
                        await processMediaURL(variants[0].url, mediaDir, i)
                    } else {
                        await processMediaURL(url, mediaDir, i)
                    }
                }
            } catch (e) {
                appendFile("./Twitter_errorlog.txt", `while archiving media: ${e.stack}\n`, function (err) {
                    if (err) throw err;
                    console.log('Error logged to file.');
                });

                console.error(`while archiving media: ${e.stack}`)
            }

        }

        if (tweet.entities.urls?.length > 0) {
            try {
                for (let i = 0; i < tweet.entities.urls.length; i++) {
                    const u = tweet.entities.urls[i]
                    const url = u.expanded_url
                    // tweets sometimes reference themselves
                    if (url === `https://twitter.com/i/web/status/${tweet.id_str}`) {
                        continue;
                    }
                    if (!tmpdir) {
                        tmpdir = await tmp.dir({ unsafeCleanup: true })
                    }
                    const headres = await axios.head(url).catch((e) => {
                        console.log(`heading ${url} - ${e.message}`)
                    })
                    if (!headres) { continue }
                    const contentType = headres.headers["content-type"]?.split(";")[0]?.toLowerCase() ?? "text/html"
                    const linkPath = p.join(tmpdir.path, `/links/${i}`)
                    if (!await checkPath(linkPath)) {
                        await mkdir(linkPath, { recursive: true })
                    }
                    // if it links a web page:
                    if (contentType === "text/html") {
                        // add to article DB.
                        console.log(`giving ${url} to Article`)
                        await article.addUrl(url)
                    } else {
                        await processMediaURL(url, linkPath, i)
                    }
                }
            } catch (e) {
                appendFile("./Twitter_errorlog.txt", `While processing URLs: ${e.stack ?? e.message}\n`, function (err) {
                    if (err) throw err;
                    console.log('Error logged to file.');
                });
                console.error(`While processing URLs: ${e.stack ?? e.message}`)
            }

        }
        // if the tweet had some attachments, upload the tmp folder containing said media/site snapshots.
        if (tmpdir) {
            // upload dir
            const mres = await bundlr.uploader.uploadFolder(tmpdir.path, null, 10, false, async (_) => { })
            if (mres && mres != "none") {
                tags.push({ name: "Media-Manifest-ID", value: `${mres}` })
                console.log(`https://node2.bundlr.network/tx/${mres}/data`)
            }

            // clean up manifest and ID file.
            const mpath = p.join(p.join(tmpdir.path, `${p.sep}..`), `${p.basename(tmpdir.path)}-manifest.json`)
            if (await checkPath(mpath)) {
                await unlink(mpath);
            }
            const idpath = p.join(p.join(tmpdir.path, `${p.sep}..`), `${p.basename(tmpdir.path)}-id.txt`)
            if (await checkPath(idpath)) {
                await unlink(idpath);
            }

            await tmpdir.cleanup()
        }
        var url = ("https://twitter.com/" + tweet.user.screen_name + "/status/" + tweet.id_str);
        console.log("Uploading...");
        var filename = `screenshots/${tweet.id_str}.png`;
        await mutex.runExclusive(async () => {
            const page = await getPage();
            await navigatePageSimple(page, url, { waitFor: 10000 });
            //await new Promise(res => setTimeout(res, 1000 * 10));
            await page.evaluate(() => document.querySelector('[data-testid="BottomBar"]') != null ? document.querySelector('[data-testid="BottomBar"]').innerHTML = "" : null)
            await page.evaluate(() => document.querySelector('[role="status"]') != null ? document.querySelector('[role="status"]').innerHTML = "" : null)
            await page.screenshot({ path: filename, fullPage: true });
            page.browser().disconnect();
            // Code for file compression to cut costs if file is 100kb or larger
            var data: Buffer;
            if ((fs.statSync(filename).size / 1024) > 100) {
                console.log("File above 100kb, compressing....");
                try {
                    compress_images(filename, "screenshots/compressed/", { compress_force: false, statistic: true, autoupdate: true }, false,
                        { jpg: { engine: false, command: false } },
                        { png: { engine: "pngquant", command: ["--quality=20-50", "-o"] } },
                        { svg: { engine: false, command: false } },
                        { gif: { engine: false, command: false } },
                        async function (error, completed, statistic) {
                            if (error) {
                                throw new Error("Compression failed");
                            } else if (completed) {
                                fs.unlinkSync(filename);
                                console.log("Compression successful")
                                var newFilename = `screenshots/compressed/${tweet.id_str}.png`;
                                await new Promise(res => fs.readFile(newFilename, function (err, d) {
                                    if (err) {
                                        throw err;
                                    } else {
                                        res(d);
                                    }
                                })).then(async (data) => {
                                    UploadToBundlr(data, tags).catch(e => {
                                        throw e;
                                    });
                                    if (fs.existsSync(newFilename)) {
                                        fs.unlinkSync(newFilename);
                                    }
                                }).catch(x => {
                                    if (fs.existsSync(newFilename)) {
                                        fs.unlinkSync(newFilename);
                                    }
                                    throw x;
                                });
                            }
                        }

                    )

                } catch (e) {
                    console.log("Compression failed, uploading original file");
                    await new Promise(res => fs.readFile(filename, function (err, d) {
                        if (err) {
                            throw err;
                        } else {
                            res(d);
                        }
                    })).then(async (data) => {
                        UploadToBundlr(data, tags).catch(e => {
                            throw e;
                        });
                        if (fs.existsSync(filename)) {
                            fs.unlinkSync(filename);
                        }
                    });
                }


            } else {
                await new Promise(res => fs.readFile(filename, function (err, d) {
                    if (err) {
                        throw err;
                    } else {
                        res(d);
                    }
                })).then(async (data) => {
                    UploadToBundlr(data, tags).catch(e => {
                        throw e;
                    });

                    if (fs.existsSync(filename)) {
                        fs.unlinkSync(filename);
                    }
                });

            }
            console.log("Complete");
            pTPS++;
        });

    } catch (e) {
        if (fs.existsSync(filename)) {
            fs.unlinkSync(filename);
        }
        appendFile("./Twitter_errorlog.txt", `general error: ${e.stack ?? e.message}\n`, function (err) {
            if (err) throw err;
            console.log('Error logged to file.');
        });
        console.log(`general error: ${e.stack ?? e.message}`)
        if (tmpdir) {
            await tmpdir.cleanup()
        }
    };

}
async function UploadToBundlr(data: any, tags: any): Promise<void> {
    const tx = await bundlr.createTransaction(data, { tags: tags })
    await tx.sign();
    try {
        await tx.upload()
    } catch (e) {
        console.log(e.message);
        return;
    }
}

export async function processMediaURL(url: string, dir: string, i: number) {
    return new Promise(async (resolve, reject) => {
        const ext = url?.split("/")?.at(-1)?.split(".")?.at(1)?.split("?").at(0) ?? "unknown"
        const wstream = createWriteStream(p.join(dir, `${i}.${ext}`))
        const res = await axios.get(url, {
            responseType: "stream"
        }).catch((e) => {
            console.log(`getting ${url} - ${e.message}`)
        })
        if (!res) { return }
        await res.data.pipe(wstream) // pipe to file
        wstream.on('finish', () => {
            resolve("done")
        })
        wstream.on('error', (e) => {
            reject(e)
        })
    })

}
main();
