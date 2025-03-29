import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import quoteModel from './models/postgres.js';
import axios from 'axios';
import fs from 'fs';
dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use(express.static('dist', {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

morgan.token('body', (req) => JSON.stringify(req.body));
morgan.token('bodyLength', (req) => (JSON.stringify(req.body)).length);
app.use(morgan(':method :url  status :status - :response-time ms content: :body :bodyLength Length  :res[header]'));

app.get('/api', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const strict = req.query.strict === 'true';
    const searchTerm = strict ? `\\b${req.query.searchTerm}\\b` : req.query.searchTerm || '';
    const selectedValue = req.query.selectedValue;
    const selectedMode = req.query.selectedMode;
    const year = req.query.year;
    const sortOrder = req.query.sortOrder;
    const gameName = req.query.gameName ? decodeURIComponent(req.query.gameName).replace(/\+/g, ' ').trim() : "all";
    const searchPath = selectedMode === "searchTitle" ? "title" : "text";

    try {
        const result = await quoteModel.search({
            searchTerm,
            searchPath,
            gameName,
            selectedValue,
            year,
            sortOrder,
            page
        });

        res.json(result);
    } catch (error) {
        console.error('Search error:', error);
        console.error('Search parameters:', {
            searchTerm,
            selectedValue,
            selectedMode,
            year,
            sortOrder,
            gameName,
            searchPath
        });
        res.status(500).json({ 
            error: 'Search failed',
            details: error.message
        });
    }
});

app.get('/stats', async (req, res) => {
    try {
        const stats = await quoteModel.getStats();
        res.json({ data: stats });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Add new endpoint for flagging quotes
app.post('/api/flag', async (req, res) => {
    try {
        const { quote, searchTerm, timestamp, videoId, title, channel, reason } = req.body;
        
        // Create Discord webhook message
        const webhookMessage = {
            embeds: [{
                title: "🚩 Quote Flagged",
                color: 15158332, // Red color
                fields: [
                    {
                        name: "Search Term",
                        value: searchTerm || "N/A",
                        inline: true
                    },
                    {
                        name: "Channel",
                        value: channel || "N/A",
                        inline: true
                    },
                    {
                        name: "Video Title",
                        value: title || "N/A",
                        inline: true
                    },
                    {
                        name: "Quote",
                        value: quote || "N/A",
                        inline: false
                    },
                    {
                        name: "Timestamp",
                        value: timestamp ? `[${timestamp}](https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(timestamp) - 1})` : "N/A",
                        inline: true
                    },
                    {
                        name: "Feedback",
                        value: reason ? `\`\`\`${reason}\`\`\`` : "No feedback provided",
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: "Quote Flagging System"
                }
            }]
        };

        // Send to Discord webhook
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) {
            throw new Error('Discord webhook URL not configured');
        }

        await axios.post(webhookUrl, webhookMessage);
        res.json({ success: true });
    } catch (error) {
        console.error('Error flagging quote:', error);
        res.status(500).json({ error: 'Failed to flag quote' });
    }
});

app.get('/api/random', async (req, res) => {
    try {
        const result = await quoteModel.getRandom();
        res.json({ quotes: result });
    } catch (error) {
        console.error('Error fetching random quotes:', error);
        res.status(500).json({ error: 'Failed to fetch random quotes' });
    }
});

app.get('/api/games', async (req, res) => {
    try {
        const games = await fs.promises.readFile('game_titles.txt', 'utf8');
        const gameList = games.split('\n')
            .map(game => game.trim())
            .filter(game => game !== '');
        res.json({ games: gameList });
    } catch (error) {
        console.error('Error reading game titles:', error);
        res.status(500).json({ error: 'Failed to fetch game titles' });
    }
});

const errorHandler = (error, req, res, next) => {
    console.error(error.message);
    if (error.name === 'CastError') {
        return res.status(400).send({ error: 'malformatted id' });
    } else if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
    }
    next(error);
};

app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});



