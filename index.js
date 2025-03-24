import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import quote from './models/mongodb.js';
import axios from 'axios';
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


app.get('/api', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const strict = req.query.strict === 'true';
    const searchTerm = strict ? `\\b${req.query.searchTerm}\\b` : req.query.searchTerm || '';
    const selectedValue = req.query.selectedValue;
    const selectedMode = req.query.selectedMode;
    const searchPath = selectedMode === "searchTitle" ? "title" : "text";

    console.log('Selected Mode:', selectedMode);
    console.log('Search Path:', searchPath);
    
    // Define the aggregation pipeline
    const pipeline = [
        {
            $search: {
                index: "default", // Specify your search index
                phrase: {
                    query: searchTerm, // The search term
                    path: searchPath // The field you're searching in
                }
            }
        },
        ...(selectedValue && selectedValue !== "all" ? [
            {
                $match: {
                    channel_source: selectedValue
                }
            }
        ] : [])
    ];
    
    // Add grouping logic based on search mode
    if (selectedMode === "searchTitle") {
        // When searching by title, include a placeholder quote with "-"
        pipeline.push(
            {
                $group: {
                    _id: "$video_id",
                    video_id: { $first: "$video_id" },
                    title: { $first: "$title" },
                    upload_date: { $first: "$upload_date" },
                    channel_source: { $first: "$channel_source" },
                    quotes: {
                        $push: {
                            text: "-",
                            line_number: { $ifNull: ["$line_number", 0] },
                            timestamp_start: { $ifNull: ["$timestamp_start", "00:00:00"] },
                            title: { $ifNull: ["$title", ""] },
                            upload_date: { $ifNull: ["$upload_date", ""] },
                            channel_source: { $ifNull: ["$channel_source", ""] }
                        }
                    }
                }
            },
            // Limit to just one quote per video when searching by title
            {
                $addFields: {
                    quotes: { $slice: ["$quotes", 1] }
                }
            }
        );
    } else {
        // When searching by text, include the full quotes
        pipeline.push(
            {
                $group: {
                    _id: "$video_id",
                    video_id: { $first: "$video_id" },
                    title: { $first: "$title" },
                    upload_date: { $first: "$upload_date" },
                    channel_source: { $first: "$channel_source" },
                    quotes: {
                        $push: {
                            text: "$text",
                            line_number: "$line_number",
                            timestamp_start: "$timestamp_start",
                            title: "$title",
                            upload_date: "$upload_date",
                            channel_source: "$channel_source"
                        }
                    }
                }
            }
        );
    }
    
    // Add pagination
    pipeline.push(
        { $skip: skip },
        { $limit: limit }
    );

    quote.aggregate(pipeline)
        .then(result => {
            res.json({ data: result });
        })
        .catch(error => res.status(500).send({ error: 'Something went wrong' }));
});





app.get('/stats', async (req, res) => {
    try {
        const stats = await quote.aggregate([
            { $match: { channel_source: { $exists: true } } }, // Filter for documents with channel_source
            {
                $group: {
                    _id: { $ifNull: ["$channel_source", "Unknown"] }, // Handle missing channel_source
                    distinctVideos: { $addToSet: "$video_id" },
                    total: { $sum: 1 }
                }
            },
            {
                $project: {
                    channel_source: "$_id",
                    videoCount: { $size: "$distinctVideos" },
                    totalQuotes: "$total",
                    _id: 0 // Remove the _id field from the final result
                }
            },
            {
                $sort: { videoCount: -1 }
            }
        ]);

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
        const result = await quote.aggregate([
            { $sample: { size: 10 } },
            {
                $group: {
                    _id: "$video_id",
                    video_id: { $first: "$video_id" },
                    title: { $first: "$title" },
                    upload_date: { $first: "$upload_date" },
                    channel_source: { $first: "$channel_source" },
                    quotes: {
                        $push: {
                            text: "$text",
                            line_number: "$line_number",
                            timestamp_start: "$timestamp_start",
                            title: "$title",
                            upload_date: "$upload_date",
                            channel_source: "$channel_source"
                        }
                    }
                }
            }
        ]);
        res.json({ quotes: result });
    } catch (error) {
        console.error('Error fetching random quotes:', error);
        res.status(500).json({ error: 'Failed to fetch random quotes' });
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
