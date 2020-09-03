#!/usr/bin/env node

const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const shuffle = require('shuffle-array');

if ('sitemap' in argv) {
    var sitemapUrl = argv.sitemap;
} else {
    throw new Error('Need --sitemap specified: URL to sitemap.');
}
let configFile = false;
if ('config' in argv) {
  if (fs.existsSync(argv.config)) {
    configFile = argv.config;
  }
}
let sitemapFind = false;
if ('f' in argv) {
    sitemapFind = argv.f;
}
let sitemapReplace = false;
if ('r' in argv) {
    sitemapReplace = argv.r;
}
let limit = 0;
if ('limit' in argv) {
    limit = argv.limit;
}
let randomize = false;
if ('randomize' in argv) {
    randomize = true;
}

function getUrls(sitemapUrl, tag = 'url', sitemapExclude = false, sitemapFind = false, sitemapReplace = false) {
    console.log(sitemapUrl);
    return Promise.resolve()
        .then(() => {
            return fetch(sitemapUrl);
        })
        .then(response => {
            return response.text();
        })
        .then(body => {
            return cheerio.load(body, {
                xmlMode: true
            });
        })
        .then($ => {
            let urls = [];
            $(tag + ' > loc').toArray().forEach(element => {
                let url = $(element).text();
                if (sitemapExclude && url.match(sitemapExclude)) {
					return;
				}
				if (sitemapFind && sitemapReplace) {
					url = url.replace(sitemapFind, sitemapReplace);
                }
                urls.push(url);
            });
            return urls;
        })
        .catch(error => {
			if (error.stack && error.stack.includes('node-fetch')) {
				throw new Error(`The sitemap "${sitemapUrl}" could not be loaded`);
			}
			throw new Error(`The sitemap "${sitemapUrl}" could not be parsed`);
        });
}

Promise.resolve()
    .then(() => {
        return getUrls(sitemapUrl, 'sitemap');
    })
    .then(urls => {
        return urls.concat([sitemapUrl]);
    })
    .then(sitemaps => {
        sitemapResolvers = sitemaps.map(sitemap => {
            return getUrls(sitemap, 'url', false, sitemapFind, sitemapReplace);
        });
        return Promise.all(sitemapResolvers);
    })
    .then(resolved => {
        // flatten
        return [].concat.apply([], resolved);
    })
    .then(urls => {
        if (randomize) {
            urls = shuffle(urls);
        }
        return urls;
    })
    .then(urls => {
        // optionally truncate
        if (limit > 0) {
            limit = (limit > urls.length)? urls.length : limit;
            urls = urls.slice(0, limit + 1);
        }
        return urls;
    })
    .then(urls => {
        // clean out blanks
        return urls.filter(i => (typeof i === 'string') && (i.startsWith('http')))
    })
    .then(urls => {
        process.stdout.write(urls.join('\n') + '\n');

        if (configFile) {
            var data = fs.readFileSync(configFile);
            var config = JSON.parse(data);  
            if (!('urls' in config)) {
                config.urls = [];
            }
            config.urls = config.urls.concat(urls);
            config.urls = config.urls.filter((v, i, a) => a.indexOf(v) === i);
            data = JSON.stringify(config);  
            fs.writeFileSync(configFile, data);
        }
    })
    .catch(error => {
        throw new Error();
    });