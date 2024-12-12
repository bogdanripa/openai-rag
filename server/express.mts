import express, { Response } from 'express';
import Basics from './basics.mjs';
import Scrape from './scrape.mjs';
import Vector from './vector.mjs';
import Query from './query.mjs';

// Create an Express application
const app = express();

// Middleware to parse JSON requests
app.use(express.json());

function checkEnvVars(res: Response): boolean {
    if (!process.env.SEARCH_URL) {
        res.status(404).send('SEARCH_URL environment variable is not set.');
        return false;
    }
    if (!process.env.MY_MONGO_DB_DATABASE_URL) {
        res.status(404).send('MY_MONGO_DB_DATABASE_URL environment variable is not set.');
        return false;
    }   
    if (!process.env.OPENAI_API_KEY) {
        res.status(404).send('OPENAI_API_KEY environment variable is not set.');
        return false;
    }
    return true;
}

// Basic route
app.get('/url', (req, res) => {
    if (!checkEnvVars(res)) return;
    try {
        res.send(Basics.getSearchUrl());
    } catch (e:any) {
        res.status(500).send(e.message);
    }
});

app.get('/status', async (req, res) => {
    if (!checkEnvVars(res)) return;
    try {
        res.json(await Basics.status());
    } catch (e:any) {
        res.status(500).send(e.message);
    }
});

app.get('/scrape', async (req, res: express.Response) => {
    if (!checkEnvVars(res)) return;
    try {
        await Scrape.scrape(res);
    } catch (e:any) {
        res.status(500).send(e.message);
    }
});

app.get('/index', async (req, res: express.Response) => {
    if (!checkEnvVars(res)) return;
    try {
        await Vector.index(res);
    } catch (e:any) {
        res.status(500).send(e.message);
    }
});

app.post('/search', async (req, res: express.Response) => {
    if (!checkEnvVars(res)) return;
    try {
        await Query.search(req.body.query, res);
    } catch (e:any) {
        res.status(500).send(e.message);
    }
});

// Start the server
app.listen(8080, () => {
    console.log(`Server is running`);
});
