import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import quote from './models/mongodb.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

morgan.token('body', (req) => JSON.stringify(req.body));
morgan.token('bodyLength', (req) => (JSON.stringify(req.body)).length);
app.use(morgan(':method :url  status :status - :response-time ms content: :body :bodyLength Length  :res[header]'));
app.use(morgan(':method :url  status :status - :response-time ms content: :body :bodyLength Length  :res[header]'));

app.get('/api', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const strict = req.query.strict === 'true';
    const searchTerm = strict ? `\\b${req.query.searchTerm}\\b` : req.query.searchTerm || '';
    const selectedValue = req.query.selectedValue;
    console.log(strict, searchTerm);

    quote.aggregate([
        {
            $search: {
                index: "default", // Specify your search index
                phrase: {
                    query: searchTerm, // The search term
                    path: "text" // The field you're searching in
                }
            }
        },
        ...(selectedValue && selectedValue !== "all" ? [
            {
                $match: {
                    channel_source: selectedValue
                }
            }
        ] : []),

        {
            $group: {
                _id: "$video_id",
                video_id: { $first: "$video_id" },
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
        },
        { $skip: skip },
        { $limit: limit }
    ])

    .then(result => {
        res.json({ data: result });
    })
    .catch(error => res.status(500).send({ error: 'Something went wrong' }));
});

app.get('/stats', async (req, res) => {
    try {
        const stats = await quote.aggregate([
            {
                $group: {
                    _id: "$channel_source",
                    distinctVideos: { $addToSet: "$video_id" },
                    total: { $sum: 1 }
                }
            },
            {
                $project: {
                    channel_source: "$_id",
                    videoCount: { $size: "$distinctVideos" },
                    totalQuotes: "$total"
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
