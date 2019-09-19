const request = require('request');
const cheerio = require('cheerio');
const mysql = require('mysql');

var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: 'news_dimensionparcs'
});

con.connect();

class Website {

    constructor(id, name, url, type) {
        this.id = id;
        this.name = name;
        this.url = url;
        this.type = type;
        this.articles = [];
    }

    sendArticlesToDb() {
        let sql = 'INSERT INTO articles VALUES '

        this.articles.map((article, index) => {
            if (index !== this.articles.length - 1) {
                sql = sql + '(DEFAULT, "' + 1 + '", "' + article.image + '", "' + article.dateHour + '", "' + article.url + '", "' + article.title + '"),'
            } else {
                sql = sql + '(DEFAULT, "' + 1 + '", "' + article.image + '", "' + article.dateHour + '", "' + article.url + '", "' + article.title + '");'
            }

        })

        console.log(sql);

        con.query(sql, (err, result) => {
            if (err) throw err;
            console.log(this.name + ' OK !');
        });
    }

    pushArticleIntoArticles(article) {
        this.articles.push(article);
    }

}

class LooopingsWebsite extends Website {

    constructor(id, name, url, type) {
        super(id, name, url, type);
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

        return new Promise((resolve, reject) => {

            request(this.url, (error, response, body) => {

                const $ = cheerio.load(body);

                // Premier article

                let articleImage = $('#indexVak #indexTopitem').find('a .top').attr('src');
                let articleTitle = $('#indexVak #indexTopitem').find('.indexTopitemfoto h1').text();
                let articleUrl = $('#indexVak #indexTopitem a').attr('href');
                let articleDateHour = this.formatDate($('#indexVak #indexTopitem #dateline h4').text());

                looopings.pushArticleIntoArticles(new Article(looopings.id, articleUrl, articleTitle, articleImage, articleDateHour));

                // Second article

                articleImage = $('#indexVak #indexBlock .indexBlockitem').eq(0).find('#indexBlockclip a .top').attr('src');
                articleTitle = $('#indexVak #indexBlock .indexBlockitem').eq(0).find('.indexBlockitemfoto h1').text();
                articleUrl = $('#indexVak #indexBlock .indexBlockitem').eq(0).find('a').attr('href');
                articleDateHour = this.formatDate($('#indexVak #indexBlock .indexBlockitem').eq(0).find('#dateline .left h4').text());

                looopings.pushArticleIntoArticles(new Article(looopings.id, articleUrl, articleTitle, articleImage, articleDateHour));

                // Troisième article

                articleImage = $('#indexBlock .indexBlockitem').eq(1).find('a .top').attr('src');
                articleTitle = $('#indexBlock .indexBlockitem').eq(1).find('.indexBlockitemfoto h1').text();
                articleUrl = $('#indexBlock .indexBlockitem').eq(1).find('a').attr('href');
                articleDateHour = this.formatDate($('#indexBlock .indexBlockitem').eq(1).find('#dateline .left h4').text());

                looopings.pushArticleIntoArticles(new Article(looopings.id, articleUrl, articleTitle, articleImage, articleDateHour));

                $('#indexVak #indexItem').map(index => {
                    looopings.pushArticleIntoArticles(this.fetchArticlesLooopings(index, $));
                });

                resolve(null);

            });
        });
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

looopings = new LooopingsWebsite(1, 'Looopings', 'https://www.looopings.nl/', 'looopings');

looopings.fetchDataAndPopulateArticles().then(() => {
    looopings.sendArticlesToDb();
});