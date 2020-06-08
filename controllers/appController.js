const MongoClient = require("mongodb").MongoClient;
const fs = require("fs");
const natural = require("natural");
const Term = require("../model/Term").Term;
let tfidf = new natural.TfIdf();
natural.PorterStemmerRu.attach();
const classifierFilePath = "classifier.json";

let mongoClient = new MongoClient('mongodb://localhost:27017', { useNewUrlParser: true, useUnifiedTopology: true});

exports.index = function (request, response) {
    response.render("index");
}

exports.addArticlePage = function (request, response) {
    response.render("addArticle");
}

exports.addArticle = async function (request, response) {
    const txt = request.body.articleText;
    
    const sportsMeasure = await getCosMeasure(txt, "sport");
    const techMeasure = await getCosMeasure(txt, "tech");


    saveArticle(request.body.articleHeader, request.body.articleText, sportsMeasure > techMeasure ? "sport" : "tech");
    response.render("classificationResult", {
        classificationResult: {
            sportsMeasure: sportsMeasure,
            techMeasure: techMeasure
        }
    });
}

exports.trainPage = function (request, response) {
    response.render("train");
}

exports.train = function (request, response) {    
    if (fs.existsSync(classifierFilePath)) {
        tfidf = new natural.TfIdf(JSON.parse(fs.readFileSync(classifierFilePath)));
    } else {
        tfidf = new natural.TfIdf();
    }
    const category = request.body.category;
    request.files.forEach(f => {
        tfidf.addDocument(f.buffer.toString().tokenizeAndStem(), category);
    });    
    fs.writeFileSync(classifierFilePath, JSON.stringify(tfidf));
    const terms = getTerms(tfidf);
    const techWordsCount = getWordsCount(tfidf, "tech");
    const sportsWordsCount = getWordsCount(tfidf, "sport");
    terms.forEach(t => {
        const sumFrequence = getWordSumFrequence(tfidf, t.term);
        techPmi = Math.log2((t.techCount + 1) * (techWordsCount + sportsWordsCount) / (sumFrequence * techWordsCount));
        sportPmi = Math.log2((t.sportsCount + 1) * (techWordsCount + sportsWordsCount)  / (sumFrequence * sportsWordsCount));
        t.estimation = (techPmi - sportPmi);
        t.updateCategory();
    });
    mongoClient.connect()
        .then(c => {
            c.db("web_lab8").collection("terms").deleteMany({});
            c.db("web_lab8").collection("terms").insertMany(terms)
        });
    response.redirect("/");
}

exports.getArticlesByCategory = function (request, response) {
    mongoClient.connect()
        .then((c) => 
            c.db("web_lab8")
                .collection("articles")
                .find({
                    category: request.params.category
                })
                .toArray()
        )
        .then((articles) => {
            response.render("articles", {
                articles: (articles || [])
            });
        })
}

function saveArticle(header, text, category) {
    return mongoClient.connect()
        .then(c => c.db("web_lab8").collection("articles").insertOne({
            header: header,
            text: text,
            category: category
        }));
}

function getTerms(tfidf) {
    const terms = [];
    for (let i = 0; i < tfidf.documents.length; i++) {
        tfidf.listTerms(i).forEach(t => {
            if (t.tfidf === 0) {
                return;
            }
            let term = terms.filter(x => x.term === t.term)[0];
            if (!term) {
                term = new Term(t.term);
                terms.push(term);
            }
            if (tfidf.documents[i].__key === "sport") {
                term.sportsCount += t.tf;
            } else {
                term.techCount += t.tf;
            }
        });
    }
    return terms;
}

function getWordsCount(tfidf, category) {
    let count = 0;
    tfidf.documents.forEach((d, i)=> {
        if (d.__key !== category) {
            return;
        }
        tfidf.listTerms(i).forEach(t => {
            count += t.tf;
        })
    });
    return count;
}

function getWordSumFrequence(tfidf, word) {
    let count = 0;
    tfidf.documents.forEach((d,i) => {
        tfidf.listTerms(i).forEach(t => {
            if (t.term === word) {
                count += t.tf;
            }
        })
    })
    return count;
}

async function getCategoryTerms(category) {
    const client = await mongoClient.connect();
    return client.db("web_lab8").collection("terms").find({category: category}).toArray();
}

async function getCosMeasure(txt, category) {    
    tfidf = new natural.TfIdf();
    tfidf.addDocument(txt.tokenizeAndStem());
    const categoryTerms = await getCategoryTerms(category);
    let nominator = 0;
    let denominatorLeft = 0;
    let denominatorRight = 0;
    
    tfidf.listTerms(0).forEach(x => {
        categoryTerms.forEach(t => {
            let vectorValue = 0;
            if (x.term === t.term) {
                vectorValue = t.category === "sport" ? t.sportsCount : t.techCount;                
            }
            nominator += x.tf * vectorValue;
            denominatorLeft += x.tf * x.tf;
            denominatorRight += vectorValue * vectorValue;
        });
    });
    return nominator / (Math.sqrt(denominatorLeft) * Math.sqrt(denominatorRight));
}