const request = require('request');
const cheerio = require('cheerio');
const mysql = require('mysql');
const winston = require('winston');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
    ]
});

const con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: 'news_dimensionparcs'
});

con.connect();

let websites = [];
let maxPageRefresh = 6;
let alreadyDone = false;

class Website {

    constructor(id, name, url) {
        this.id = id;
        this.name = name;
        this.url = url;
        this.articles = [];
    }

    sendArticlesToDb() {

        return new Promise(() => {
            if (this.articles[0]) {

                con.query('SELECT * FROM articles WHERE idwebsite = "' + this.id + '";', (err, results) => {

                    if (err) throw err;

                    let sqlStart = 'INSERT INTO articles VALUES ';
                    let sqlRequest = sqlStart;

                    this.articles.map((article, index) => {

                        if (!results.filter(result => result.url === article.url)[0]) {
                            if (index !== this.articles.length - 1) {
                                sqlRequest = sqlRequest + '(DEFAULT, "' + this.id + '", "' + article.image + '", "' + article.dateHour + '", "' + article.url + '", "' + article.title + '"),'
                            } else {
                                sqlRequest = sqlRequest + '(DEFAULT, "' + this.id + '", "' + article.image + '", "' + article.dateHour + '", "' + article.url + '", "' + article.title + '");'
                            }
                        }

                    });

                    if (sqlStart !== sqlRequest) {

                        if (sqlRequest.substr(sqlRequest.length - 1, 1) === ',') {
                            sqlRequest = sqlRequest.replace(/.$/, ";");
                        }

                        con.query(sqlRequest, (err) => {
                            if (err) throw sqlRequest + '\n' + err;
                            logger.info(this.name + ' OK !');
                        });

                    } else {
                        logger.info('Aucun nouvel article pour ' + this.name);
                    }

                });


            } else {
                logger.info('No articles for ' + this.name);
            }
        });

    }

    pushArticleIntoArticles(article) {
        this.articles.push(article);
    }

}

class LooopingsWebsite extends Website {

    constructor(id, name, url) {
        super(id, name, url);
    }

    static formatDate(dateParam) {

        let date;

        if (dateParam.includes('Gisteren')) {

            let hour = dateParam.replace('Gisteren, ', '').replace(' uur', '');

            date = new Date();

            date.setDate(date.getDate() - 1);

            date.setHours(Number(hour.substr(0, 2)));
            date.setMinutes(Number(hour.substr(3, 2)));

        } else if (dateParam.includes('Vandaag')) {

            let hour = dateParam.replace('Vandaag, ', '').replace(' uur', '');

            date = new Date();

            date.setHours(Number(hour.substr(0, 2)));
            date.setMinutes(Number(hour.substr(3, 2)));

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

        let articleContainer = $("#indexVak #indexItem").eq(index);

        let articleImage = $(articleContainer).find('a img').attr('src');

        let articleTitle = $(articleContainer).find('#indexItemtitel h1 a').text();

        let articleUrl = $(articleContainer).find('#indexItemfoto a').attr('href');

        let articleDateHour = this.formatDate($(articleContainer).find('#indexItemtitel #dateline .left h4').text());


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
                    reject('rest_post_invalid_page_number');
                } else {
                    for (let i = 0; i < body.length; i++) {
                        try {
                            this.pushArticleIntoArticles(new Article(this.id, body[i].link, body[i].title.rendered, body[i]._embedded['wp:featuredmedia']['0'].source_url, body[i].modified));
                        } catch (err) {
                            break;
                        }
                    }
                }

                resolve();

            });

        });

    }

    async fetchDataAndPopulateArticles() {

        return new Promise( async () => {

            let iteration = 1;

            while (iteration !== 0) {

                if (maxPageRefresh === iteration) {
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

        });

    }

}

blackList = ['WDWNT', 'Attractions Magazine', 'Blog Mickey', 'ED92', 'Inside The Magic', 'Coaster 101'];

function dayRuntime() {

    let getCurrentHours = new Date();

    let timer = setTimeout(() => {

        if (getCurrentHours.getHours() >= 4 && getCurrentHours.getHours() < 5 && alreadyDone !== getCurrentHours.getDate()) {
            nightRuntime();
            clearInterval(timer);
        }

        con.query('SELECT * from website', async (err, results) => {

            maxPageRefresh = 6;

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

            try {
                await websiteParsing();
                logger.info('Version de jour terminée !');
                dayRuntime();
            } catch (e) {
                throw err;
            }


        });

    }, 5000);

}

function nightRuntime() {

    con.query('SELECT * from website', async (err, results) => {

        maxPageRefresh = null;

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
                    await website.sendArticlesToDb();
                } catch(err) {
                    throw err;
                }
            }
        })
    )
}

dayRuntime();