/* http://localhost:3000/download?url=https://www.tiktok.com/@juno_okyo/video/7398938493998697734?is_from_webapp=1&sender_device=pc
*/

import express from 'express';
import fetch, { Headers } from 'node-fetch';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import { chromium } from 'playwright';
import readline from 'readline';
import path from 'path';

const app = express();
const port = 3000;

// Adding useragent to avoid IP bans
const headers = new Headers();

const getVideo = async (url, watermark) => {
    const idVideo = await getIdVideo(url);
    const API_URL = `https://api22-normal-c-alisg.tiktokv.com/aweme/v1/feed/?aweme_id=${idVideo}&iid=7318518857994389254&device_id=7318517321748022790&channel=googleplay&app_name=musical_ly&version_code=300904&device_platform=android&device_type=ASUS_Z01QD&version=9`;
    const request = await fetch(API_URL, {
        method: "OPTIONS",
        headers: headers,
    });
    const body = await request.text();
    try {
        var res = JSON.parse(body);
    } catch (err) {
        console.error("Error:", err);
        console.error("Response body:", body);
    }

    if (res.aweme_list[0].aweme_id != idVideo) {
        return null;
    }

    let urlMedia = "";
    let image_urls = [];

    if (!!res.aweme_list[0].image_post_info) {
        console.log(chalk.green("[*] Video is slideshow"));
        res.aweme_list[0].image_post_info.images.forEach((element) => {
            image_urls.push(element.display_image.url_list[1]);
        });
    } else if (res.aweme_list[0].video) {
        urlMedia = null;
        const video = res.aweme_list[0].video;
        if (watermark) {
            if (video.download_addr && video.download_addr.url_list && video.download_addr.url_list.length > 0) {
                urlMedia = video.download_addr.url_list[0];
            }
        }
        if (urlMedia === null) {
            if (video.play_addr && video.play_addr.url_list && video.play_addr.url_list.length > 0) {
                urlMedia = video.play_addr.url_list[0];
            } else {
                console.error('Error: video download_addr or play_addr or their url_list is missing.');
            }
        }
    } else {
        console.error('Error: video or image_post_info is missing in the aweme object.');
    }

    const data = {
        url: urlMedia,
        images: image_urls,
        id: idVideo,
    };
    return data;
};

const getIdVideo = async (url) => {
    if (url.includes("/t/")) {
        url = await new Promise((resolve) => {
            import("follow-redirects").then(({ https }) => {
                https.get(url, function (res) {
                    resolve(res.responseUrl);
                });
            });
        });
    }
    const matching = url.includes("/video/");
    const matchingPhoto = url.includes("/photo/");
    let idVideo = url.substring(
        url.indexOf("/video/") + 7,
        url.indexOf("/video/") + 26
    );
    if (matchingPhoto)
        idVideo = url.substring(
            url.indexOf("/photo/") + 7,
            url.indexOf("/photo/") + 26
        );
    else if (!matching) {
        console.log(chalk.red("[X] Error: URL not found"));
        process.exit();
    }
    return idVideo.length > 19
        ? idVideo.substring(0, idVideo.indexOf("?"))
        : idVideo;
};

const downloadMedia = async (item, res) => {
    const now = new Date();
    const timestamp = `${now.getDate()}_${now.getMonth() + 1}_${now.getFullYear()}_${now.getHours()}_${now.getMinutes()}`;
    const fileName = `api_hunglunna_${timestamp}`;

    if (item.images.length != 0) {
        console.log(chalk.green("[*] Downloading Slideshow"));
        let index = 0;
        const imageStreams = item.images.map((image_url) => {
            const imageName = `${fileName}_${index}.jpeg`;
            index++;
            return fetch(image_url).then((res) => res.body);
        });
        const imageBuffers = await Promise.all(imageStreams);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}.zip`);
        const zip = require('archiver')('zip');
        zip.pipe(res);
        imageBuffers.forEach((buffer, i) => {
            zip.append(buffer, { name: `${fileName}_${i}.jpeg` });
        });
        zip.finalize();
    } else {
        const videoName = `${fileName}.mp4`;
        const downloadFile = fetch(item.url);
        downloadFile.then((response) => {
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename=${videoName}`);
            response.body.pipe(res);
        });
    }
};

app.get('/download', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).send('URL is required');
    }

    const data = await getVideo(url, false); // Default to "Without Watermark"
    if (data == null) {
        return res.status(404).send('Video not found or deleted');
    }

    await downloadMedia(data, res);
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
