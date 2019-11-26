const request = require('request');
const cheerio = require('cheerio');
const mysql = require('mysql');
const winston = require('winston');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
    ]
});

var con = mysql.createConnection({
    host: "localhost",
    port: "8889",
    user: "root",
    password: "root",
    database: 'news_dimensionparcs'
});

con.connect();

var websites = new Array();
maxPageRefresh = true;

class Website {

    constructor(id, name, url) {
        this.id = id;
        this.name = name;
        this.url = url;
        this.articles = new Array();
    }

    sendArticlesToDb() {

        if (this.articles[0]) {

            con.query('SELECT * FROM articles WHERE idwebsite = "' + this.id + '";', (err, results) => {

                if (err) throw err;

                let sql = 'INSERT INTO articles VALUES '

                this.articles.map((article, index) => {

                    if (!results.filter(result => result.url === article.url)[0]) {
                        if (index !== this.articles.length - 1) {
                            sql = sql + '(DEFAULT, "' + this.id + '", "' + article.image + '", "' + article.dateHour + '", "' + article.url + '", "' + article.title + '"),'
                        } else {
                            sql = sql + '(DEFAULT, "' + this.id + '", "' + article.image + '", "' + article.dateHour + '", "' + article.url + '", "' + article.title + '");'
                        }
                    }

                });

                if (sql !== 'INSERT INTO articles VALUES ') {

                    if (sql.substr(sql.length - 1, 1) === ',') {
                        sql = sql.replace(/.$/, ";");
                    }

                    con.query(sql, (err) => {
                        if (err) throw sql + '\n' + err;
                        logger.info(this.name + ' OK !');
                    });
                } else {
                    logger.info('Aucun nouvel article pour ' + this.name);
                }

            });


        } else {
            logger.info('No articles for ' + this.name);
        }

    }

    pushArticleIntoArticles(article) {
        this.articles.push(article);
    }

}

class LooopingsWebsite extends Website {

    constructor(id, name, url) {
        super(id, name, url);
    }

    formatDate(dateParam) {

        let date;

        if (dateParam.includes('Gisteren')) {

            let hour = dateParam.replace('Gisteren, ', '').replace(' uur', '');

            date = new Date();

            date.setDate(date.getDate() - 1);

            date.setHours(hour.substr(0, 2));
            date.setMinutes(hour.substr(3, 2));

        } else if (dateParam.includes('Vandaag')) {

            let hour = dateParam.replace('Vandaag, ', '').replace(' uur', '');

            date = new Date();

            date.setHours(hour.substr(0, 2));
            date.setMinutes(hour.substr(3, 2));

        } else {

            let dateFormatDay = dateParam.substr(0, 2);
            let dateFormatMonth = dateParam.substr(3, 2);
            let dateFormatYear = dateParam.substr(6, 4);
            let dateFormatHourMinutes = dateParam.substr(12, 5);

            let dateToFormat = (dateFormatYear + '-' + dateFormatMonth + '-' + dateFormatDay + 'T' + dateFormatHourMinutes + ':00');

            date = new Date(dateToFormat);

        }

        return date;

    }

    fetchArticlesLooopings(index, $) {

        let articleImage = $('#indexVak #indexItem').eq(index).find('a img').attr('src');

        let articleTitle = $('#indexVak #indexItem').eq(index).find('#indexItemtitel h1 a').text();

        let articleUrl = $('#indexVak #indexItem').eq(index).find('#indexItemfoto a').attr('href');

        let articleDateHour = this.formatDate($('#indexVak #indexItem').eq(index).find('#indexItemtitel #dateline .left h4').text());


        return (new Article(1, articleUrl, articleTitle, articleImage, articleDateHour));

    }

    fetchDataAndPopulateArticles() {

        return new Promise(() => {

            request(this.url, (error, response, body) => {

                const $ = cheerio.load(body);

                // Premier article

                let articleImage = $('#indexVak #indexTopitem').find('a .top').attr('src');
                let articleTitle = $('#indexVak #indexTopitem').find('.indexTopitemfoto h1').text();
                let articleUrl = $('#indexVak #indexTopitem a').attr('href');
                let articleDateHour = this.formatDate($('#indexVak #indexTopitem #dateline h4').text());

                this.pushArticleIntoArticles(new Article(this.id, articleUrl, articleTitle, articleImage, articleDateHour));

                // Second article

                articleImage = $('#indexVak #indexBlock .indexBlockitem').eq(0).find('#indexBlockclip a .top').attr('src');
                articleTitle = $('#indexVak #indexBlock .indexBlockitem').eq(0).find('.indexBlockitemfoto h1').text();
                articleUrl = $('#indexVak #indexBlock .indexBlockitem').eq(0).find('a').attr('href');
                articleDateHour = this.formatDate($('#indexVak #indexBlock .indexBlockitem').eq(0).find('#dateline .left h4').text());

                this.pushArticleIntoArticles(new Article(this.id, articleUrl, articleTitle, articleImage, articleDateHour));

                // Troisième article

                articleImage = $('#indexBlock .indexBlockitem').eq(1).find('a .top').attr('src');
                articleTitle = $('#indexBlock .indexBlockitem').eq(1).find('.indexBlockitemfoto h1').text();
                articleUrl = $('#indexBlock .indexBlockitem').eq(1).find('a').attr('href');
                articleDateHour = this.formatDate($('#indexBlock .indexBlockitem').eq(1).find('#dateline .left h4').text());

                this.pushArticleIntoArticles(new Article(this.id, articleUrl, articleTitle, articleImage, articleDateHour));

                $('#indexVak #indexItem').map(index => {
                    this.pushArticleIntoArticles(this.fetchArticlesLooopings(index, $));
                });

                return;

            });

        });

    }

}

class WordpressWebsite extends Website {

    constructor(id, name, url) {
        super(id, name, url);
    }

    requester(iteration) {

        return new Promise((resolve, reject) => {

            request(this.url + '/wp-json/wp/v2/posts?_embed&page=' + iteration, (err, response, body) => {

                if (err) throw err;

                logger.info(this.name + ' Page ' + iteration);

                try {
                    body = JSON.parse(body);
                } catch (error) {
                    reject('Page broken');
                }

                if (body.code === 'rest_post_invalid_page_number') {
                    throw 'rest_post_invalid_page_number';
                } else {
                    body.forEach(item => {
                        try {
                            this.pushArticleIntoArticles(new Article(this.id, item.link, item.title.rendered, item._embedded['wp:featuredmedia']['0'].source_url, item.modified))
                        } catch (err) {
                            reject('Article not complete');
                        }
                    });
                    return;
                }

            });

        });

    }

    async fetchDataAndPopulateArticles() {
        let iteration = 1;

        while (iteration !== 0) {

            if (maxPageRefresh && iteration === 6) {
                break;
            }

            try {
                await this.requester(iteration);
                iteration = iteration + 1;
            } catch(err) {
                logger.info(err);
                iteration = 0;
            }

        }
    }

}

class Article {

    constructor(websiteId, url, title, image, dateHour) {
        this.websiteId = websiteId;
        this.url = url;
        this.title = title;
        this.image = image;
        this.dateHour = dateHour;
    }

}

blackList = ['WDWNT', 'Attractions Magazine', 'Blog Mickey', 'ED92', 'Inside The Magic', 'Coaster 101'];

alreadyDone = false;

function dayRuntime() {

    let getCurrentHours = new Date();

    let timer = setTimeout(() => {

        if (getCurrentHours.getHours() >= 4 && getCurrentHours.getHours() < 5 && alreadyDone !== getCurrentHours.getDate()) {
            nightRuntime();
            clearInterval(timer);
        }

        con.query('SELECT * from website', async (err, results) => {

            maxPageRefresh = true;

            if (err) throw err;

            results.map(item => {
                switch (item.type) {
                    case 'looopings':
                        //websites.push(new LooopingsWebsite(item.id, item.name, item.url));
                        break;
                    case 'wordpress':
                        websites.push(new WordpressWebsite(item.id, item.name, item.url));
                        break;
                }
            })

            await websiteParsing();
            logger.info('Version de jour terminée !');
            dayRuntime();

        });

    }, 5000);

}

function nightRuntime() {

    con.query('SELECT * from website', async (err, results) => {

        maxPageRefresh = false;

        if (err) throw err;

        results.map(item => {
            switch (item.type) {
                case 'looopings':
                    //websites.push(new LooopingsWebsite(item.id, item.name, item.url));
                    break;
                case 'wordpress':
                    websites.push(new WordpressWebsite(item.id, item.name, item.url));
                    break;
            }
        });

        await websiteParsing();
        alreadyDone = new Date().getDate();
        logger.info('Version de nuit terminée !');
        dayRuntime();

    });

}

async function websiteParsing() {
    return await Promise.all(
        websites.map(async (website) => {
            if (!blackList.includes(website.name)) {
                try {
                    await website.fetchDataAndPopulateArticles();
                    website.sendArticlesToDb();
                    return;
                } catch(err) {
                    throw err;
                }
            }
        })
    )
}

dayRuntime();