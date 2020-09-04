#!/usr/bin/env node

const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const shuffle = require('shuffle-array');
const { distance } = require('talisman/metrics/jaro-winkler');
const apclust = require('@ahebrank/affinity-propagation');
const ProgressBar = require('progress');

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
let randomize = ('randomize' in argv);
let cluster = ('cluster' in argv);

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
        if (cluster) {
            let bar = new ProgressBar(' similarity [:bar] :percent :etas', {
              complete: '=',
              incomplete: ' ',
              width: 20,
              total: urls.length * urls.length
            });

            // Build a 2d matrix of similarity.
            const dist = urls.map((url) => {
              bar.tick(urls.length);
              return urls.map((url2) => Math.floor(100 * (distance(url, url2))));
            });
            // Affinity propagation to cluster automagically.
            const result = apclust.getClusters(dist);
            // Order URLs by alternating through exemplars.
            // In theory you could then grab the first N URls to get a good sample.
            const exemplars = result.exemplars;
            exemplars.forEach((i) => {
              console.log('Cluster ' + i + ' example: ' + urls[i]);
            });
            let cluster_i = result.clusters;
            let exemplar_i = -1;
            let urls_reordered = [];
            while (urls_reordered.length < urls.length) {
              exemplar_i++;
              if (exemplar_i > exemplars.length) {
                exemplar_i = 0;
              }
              url_exemplar_i = cluster_i.indexOf(exemplars[exemplar_i]);
              if (url_exemplar_i !== -1) {
                urls_reordered.push(urls[url_exemplar_i]);
                cluster_i[url_exemplar_i] = null;
              }
            }
            urls = urls_reordered;
        }

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
        console.error(error);
    });